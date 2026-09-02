"""
Company Research Service.

Searches the web for company-specific interview intelligence using
DuckDuckGo's free HTML search endpoint, then asks the LLM to structure
the raw snippets into a reusable knowledge base stored in session.company_intel.

The knowledge base drives:
  • planner_agent   — tailors the stage order (adds coding_round for FAANG, etc.)
  • question_agent  — generates questions that match real company patterns
  • coding_question_agent — picks problems actually asked at this company

No API key is required; DuckDuckGo is queried via their public HTML endpoint.
Falls back to LLM-only knowledge if any web requests fail.
"""
from __future__ import annotations

import logging
import re
from html.parser import HTMLParser

import httpx

from app.core.config import get_settings
from app.services.llm_client import get_llm_client
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import select
from datetime import datetime, timedelta
from app.models.interview import CompanyIntelCache

logger = logging.getLogger(__name__)
settings = get_settings()

_DDG_URL = "https://html.duckduckgo.com/html/"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
_TIMEOUT = 12.0


# ── HTML → plain text ─────────────────────────────────────────────────────────

class _TextExtractor(HTMLParser):
    """Minimal HTML stripper — no third-party deps."""

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in {"script", "style", "noscript", "head"}:
            self._skip = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "head"}:
            self._skip = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            s = data.strip()
            if s:
                self._parts.append(s)

    def text(self) -> str:
        return " ".join(self._parts)


def _strip_html(html: str) -> str:
    p = _TextExtractor()
    p.feed(html)
    return p.text()


# ── DuckDuckGo search ─────────────────────────────────────────────────────────

def _ddg_snippets(query: str, max_results: int = 4) -> list[str]:
    """
    POST a query to DuckDuckGo's HTML search and return snippet strings.
    Returns [] on any network / parse error.
    """
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = client.post(
                _DDG_URL,
                data={"q": query, "kl": "us-en"},
                headers=_HEADERS,
            )
        if resp.status_code != 200:
            logger.debug("DDG returned %s for %r", resp.status_code, query)
            return []

        # Extract snippet text using a light regex then strip remaining HTML tags.
        raw_snippets = re.findall(
            r'class="result__snippet"[^>]*>(.*?)</a>',
            resp.text,
            re.DOTALL,
        )
        snippets: list[str] = []
        for s in raw_snippets[:max_results]:
            text = _strip_html(s).strip()
            if len(text) > 30:
                snippets.append(text)
        return snippets

    except Exception as exc:
        logger.warning("DDG search failed for %r: %s", query, exc)
        return []


# ── LLM structuring ───────────────────────────────────────────────────────────

_STRUCTURE_PROMPT = """\
You are the Company Interview Research Agent inside an AI interview platform.

Given raw web search snippets (possibly noisy) and your own knowledge, produce
a structured intelligence report about how this company interviews candidates
for the given role.

CRITICAL RULES:
- Prioritize web snippets as the primary source. Do NOT invent questions not
  grounded in the snippets or widely-known real interview data for this company.
- commonly_asked_questions must reflect REAL questions reported by actual candidates.
- mcq_questions must test THIS company's actual technology stack or domain — not generic CS trivia.

Respond with ONLY a single valid JSON object:
{
  "company_name": "string",
  "target_role": "string",
  "known_for": "one sentence — what makes this company's interviews distinctive",
  "interview_structure": ["string", ...],
  "rounds": ["string", ...],
  "focus_areas": ["string", ...],
  "commonly_asked_questions": [
    "string — real natural-language questions reported by actual candidates for this company. Include at least 15."
  ],
  "real_coding_questions_reported": [
    "Exact or near-exact coding question titles reported by real interviewees (e.g. 'Flatten Binary Tree to Linked List', 'LRU Cache'). Extract verbatim from snippets."
  ],
  "coding_problems": [
    {
      "title": "string — exact LeetCode-style title or close variant",
      "difficulty": "easy|medium|hard",
      "topic": "string (e.g. 'Dynamic Programming', 'Graph BFS', 'Sliding Window')",
      "frequency": "high|medium|low",
      "description_hint": "string — 1-2 sentence description of what the problem asks"
    }
  ],
  "mcq_questions": [
    {
      "question": "string — tests THIS company's specific tech stack, domain, or CS concept they focus on",
      "options": ["A", "B", "C", "D"],
      "correct_option": "string — exact text of the correct option",
      "explanation": "string — why this option is correct"
    }
  ],
  "cs_fundamentals": ["string (e.g. 'OS Memory Management', 'DBMS Indexing')", ...],
  "behavioral_themes": ["string", ...],
  "technical_emphasis": ["string", ...],
  "company_values": ["string", ...],
  "lp_principles": ["string (used for companies like Amazon that have named principles)", ...],
  "system_design_topics": ["string", ...],
  "interview_tips": ["string — specific actionable tips from real candidate reports", ...],
  "sources": []
}

Requirements:
- commonly_asked_questions: AT LEAST 15 real questions from candidate reports. Vary across behavioral, technical, and system design.
- real_coding_questions_reported: Extract EVERY coding question title mentioned in snippets verbatim.
- coding_problems: 6-8 distinct problems confirmed asked at this company. Variety of topics.
- mcq_questions: EXACTLY 20 questions. They must test THIS company's actual tech stack and interview focus areas — not random CS trivia. Each must have 4 options with 1 correct.
- cs_fundamentals: 5-10 core CS concepts this company specifically tests.
- behavioral_themes: company-specific cultural values and leadership patterns.
- lp_principles: ONLY fill for companies with officially named principles (e.g. Amazon's 16 LPs).
- interview_tips: 5+ specific tips sourced from real candidate interview reports.\
"""


def _structure(company: str, role: str, snippets: list[str]) -> dict:
    client = get_llm_client()
    snippet_block = "\n---\n".join(snippets) if snippets else "(no web snippets available)"
    user_prompt = (
        f"Company: {company}\n"
        f"Target Role: {role}\n\n"
        f"Web search snippets:\n{snippet_block[:6000]}\n\n"
        "Build the structured interview intelligence report."
    )
    try:
        return client.complete_json(_STRUCTURE_PROMPT, user_prompt)
    except Exception as exc:
        logger.error("Company research LLM call failed: %s", exc)
        return {
            "company_name": company,
            "target_role": role,
            "focus_areas": [],
            "commonly_asked_questions": [],
            "coding_problems": [],
            "technical_emphasis": [],
            "known_for": "",
        }


# ── Public API ────────────────────────────────────────────────────────────────

def research(db: DBSession, company: str, role: str) -> dict:
    """
    Build a company-specific interview knowledge base.

    Checks the local database cache first. If a recent (less than 7 days old)
    entry exists, returns it instantly. Otherwise, fires targeted web searches,
    aggregates snippets, asks the LLM to structure it, caches it, and returns.
    """
    if not settings.RESEARCH_ENABLED:
        logger.info("Research disabled — using LLM-only knowledge for %r", company)
        return _structure(company, role, [])

    # Check cache
    cached = db.execute(
        select(CompanyIntelCache)
        .where(CompanyIntelCache.company_name.ilike(company), CompanyIntelCache.target_role.ilike(role))
    ).scalars().first()

    if cached and cached.updated_at > datetime.utcnow() - timedelta(days=7):
        logger.info("Using cached company intel for %r / %r", company, role)
        return cached.intel_data

    queries = [
        f'"{company}" {role} interview experience questions 2024 site:glassdoor.com OR site:reddit.com',
        f'"{company}" software engineer interview leetcode coding problems frequently asked site:leetcode.com/discuss',
        f'"{company}" {role} interview experience site:geeksforgeeks.org OR site:careercup.com OR site:interviewbit.com',
        f'"{company}" technical interview rounds process system design behavioral',
        # Coding-specific queries to surface real problem names from community reports
        f'"{company}" coding interview questions asked 2023 2024 site:reddit.com/r/cscareerquestions OR site:reddit.com/r/leetcode',
        f'"{company}" {role} interview leetcode problems list OA online assessment',
        f'"{company}" interview "asked me" OR "they asked" coding problem algorithm data structure',
    ]

    all_snippets: list[str] = []
    for query in queries:
        snippets = _ddg_snippets(query, max_results=settings.RESEARCH_MAX_SOURCES)
        all_snippets.extend(snippets)
        if len(all_snippets) >= 15:
            break

    logger.info(
        "Company research for %r/%r: %d snippets from DuckDuckGo",
        company, role, len(all_snippets),
    )
    
    result = _structure(company, role, all_snippets)
    
    # Save to cache
    if cached:
        cached.intel_data = result
    else:
        new_cache = CompanyIntelCache(company_name=company, target_role=role, intel_data=result)
        db.add(new_cache)
    
    db.commit()
    return result
