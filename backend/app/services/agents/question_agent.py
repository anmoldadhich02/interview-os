"""
Question Generator Agent — 100% Company-Intel-Driven, Cross-Session Deduplication.

Every question MUST be freshly derived from live web-researched company_intel.
No static templates. No generic fallback questions.
All previously asked questions across ALL sessions are excluded.
"""
from app.services.llm_client import get_llm_client

SYSTEM_PROMPT = """\
You are a Senior Engineer conducting a live technical interview on behalf of
the TARGET COMPANY. Your task is to generate ONE fresh, unique, natural
interview question that:

━━ GOLDEN RULES (NEVER BREAK THESE) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ NEVER ask a question that is already in the "Questions already asked" list.
❌ NEVER ask a generic textbook question not grounded in this company's real interview patterns.
❌ NEVER fabricate details — only ask about things in the provided company_intel.
✅ EVERY question must be traceable to the company's actual interview culture.
✅ Each question must feel like it came from a real interviewer at this company.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. COMPANY SPECIFICITY — root every question in live web research:
   - Use questions directly sourced from company_intel.commonly_asked_questions.
   - Use company_intel.focus_areas to pick the most relevant concept.
   - Reference company_intel.behavioral_themes for behavioral questions.
   - Use company_intel.technical_emphasis for technical/DSA questions.
   - Use company_intel.lp_principles for companies with named principles (e.g. Amazon).
   - Use company_intel.system_design_topics for system design questions.
   - Use company_intel.mcq_questions as direct source for MCQ stage questions.
   - For startups: focus on ownership, full-stack breadth, practical impact.
   - Mirror how this company phrased real questions from interview reports.

2. STAGE FIT — match the current interview stage precisely:
   - resume_discussion → use resume items to probe deep technical knowledge of their work.
   - project_deep_dive → pick one project and probe implementation details and tradeoffs.
   - technical → Base ENTIRELY on company_intel (DSA, OS, DBMS, Networks, OOP, SQL). NOT the resume.
   - behavioral → Base ENTIRELY on company_intel.behavioral_themes and company_intel.lp_principles.
   - mcq → Source directly from company_intel.mcq_questions. If none exist, generate one about company's tech stack.
   - cs_fundamentals → Use company_intel.cs_fundamentals to pick a specific topic.
   - system_design → Use company_intel.system_design_topics. Design something in the company's domain.
   - wrap_up → Give candidate a chance to ask questions or close out naturally.

3. DIFFICULTY — calibrate complexity based on the difficulty level provided.

4. CONTINUITY — build naturally on the conversation memory. Never repeat.

Respond with ONLY a JSON object:
{
  "question": "string — phrased as a real interviewer at this company would say it",
  "targets_topic": "string — specific topic label (e.g. 'Amazon LP: Ownership', 'CUDA Thread Scheduling')",
  "source": "string — which part of company_intel this is based on (e.g. 'commonly_asked_questions', 'behavioral_themes')",
  "mcq_options": ["option A", "option B", "option C", "option D"],
  "mcq_correct_option": "exact string matching one of the options",
  "mcq_explanation": "brief explanation of why the correct option is right"
}
NOTE: mcq_options, mcq_correct_option, and mcq_explanation must be null/empty if stage is NOT 'mcq'.\
"""


def generate_question(
    profile: dict,
    stage: str,
    difficulty: str,
    memory: dict,
    previous_questions: list[str],
    target_company: str,
    company_intel: dict | None = None,
    is_coding_followup: bool = False,
    all_previously_asked: list[str] | None = None,
) -> dict:
    """
    Generate the next interview question — 100% grounded in company_intel from live web research.
    
    Args:
        all_previously_asked: Questions asked in ALL prior sessions for this user+company.
                              Combined with previous_questions to ensure zero repetition.
    """
    client = get_llm_client()

    # Merge current-session and cross-session questions into one exclusion list
    all_exclusions = list(set(previous_questions + (all_previously_asked or [])))

    intel = company_intel or {}

    intel_block = (
        f"\n━━ LIVE COMPANY INTELLIGENCE (from web research) ━━\n"
        f"  Company: {intel.get('company_name', target_company)}\n"
        f"  Known for: {intel.get('known_for', 'N/A')}\n"
        f"  Interview structure: {intel.get('interview_structure', [])}\n"
        f"  Focus areas: {intel.get('focus_areas', [])}\n"
        f"  Technical emphasis: {intel.get('technical_emphasis', [])}\n"
        f"  CS Fundamentals they test: {intel.get('cs_fundamentals', [])}\n"
        f"  Behavioral themes: {intel.get('behavioral_themes', [])}\n"
        f"  Leadership principles / values: {intel.get('lp_principles', []) or intel.get('company_values', [])}\n"
        f"  System design topics: {intel.get('system_design_topics', [])}\n"
        f"  Real MCQ questions (for mcq stage): {intel.get('mcq_questions', [])}\n"
        f"  Commonly asked questions (real interviewee reports): {intel.get('commonly_asked_questions', [])}\n"
        f"  Interview tips from candidates: {intel.get('interview_tips', [])}\n"
    )

    user_prompt = (
        f"Target company: {target_company}\n"
        f"Interview stage: {stage}\n"
        f"Difficulty: {difficulty}\n"
        f"Is coding follow-up?: {is_coding_followup}\n"
        f"{intel_block}\n"
        f"Candidate profile:\n{profile}\n\n"
        f"Conversation memory so far: {memory}\n"
        f"ALL questions already asked — NEVER repeat any of these (current + all past sessions):\n"
        f"{all_exclusions}\n\n"
        "Generate the next UNIQUE question. It MUST be grounded in the company intel above."
    )
    return client.complete_json(SYSTEM_PROMPT, user_prompt)
