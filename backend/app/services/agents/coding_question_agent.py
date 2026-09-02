"""
Coding Question Agent.

Single responsibility: given company_intel and difficulty, select or
generate a complete, well-specified coding problem for the embedded
coding round.

Priority order:
  1. Real problem from COMPANY_PROBLEM_BANK (curated, matches company history)
  2. Real problem from company_intel.coding_problems (from web research)
  3. LLM-generated problem themed around company.technical_emphasis
  4. Generic difficulty-appropriate DSA problem (final fallback)

After generation, test cases are validated by:
  - Running an LLM-generated reference Python solution through Judge0
  - Correcting any test cases whose expected_output doesn't match
  - Adding mandatory edge cases if the LLM missed them

Time limits: easy=10 mins, medium=20 mins, hard=40 mins.
"""
from __future__ import annotations

import logging
import urllib.request
import urllib.parse
import json
import random
import re

from app.data.company_problems import get_company_problems_by_difficulty, get_company_problems
from app.services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

# ── Time limits ───────────────────────────────────────────────────────────────
TIME_LIMITS = {"easy": 10, "medium": 20, "hard": 40}

# ── Problem generation prompt ─────────────────────────────────────────────────
_PROBLEM_PROMPT = """\
You are the Coding Question Agent for an AI mock interview platform.

Generate a COMPLETE, well-specified coding problem for the given company and difficulty.
The problem MUST be based on problems that have actually been reported by real interviewees
at this company (provided in the prompt). Use them as your PRIMARY source.

REQUIREMENTS:
- description: clear, unambiguous, self-contained — no references to external resources.
- Provide 2–3 public examples with input, output, and explanation.
- Provide EXACTLY 8–10 test_cases covering ALL of:
    * 2–3 visible (is_hidden: false) normal cases matching the examples
    * 2–3 visible EDGE CASES: empty input, single element, all-same, boundary values, negative numbers
    * 3–4 hidden (is_hidden: true) stress/corner cases for submission evaluation (large input, worst-case, adversarial)
- starter_code: FULL IDE-style code files for each language. Candidates write COMPLETE programs, not just method stubs.
  Each starter_code entry must be a self-contained file that:
    * Python: full file with imports at top, a solution function, and a __main__ block that reads from stdin and calls the function.
    * Java: a full class with proper package-less structure, a Solution class with the method, and a Main class with main() that reads stdin.
    * JavaScript: full Node.js file with require statements if needed, solution function, and readline-based stdin reading.
    * C++: full C++ file with #include statements, a solution function, and a main() function.
    * Go: full Go file with package main, imports, solution function, and main() function.
  DO NOT generate bare function stubs like 'def solution(s): pass'. Generate the FULL file a developer would write in their IDE.
- time_limit_minutes: easy=10, medium=20, hard=40. Use the value for the given difficulty.
- topics: 2–4 algorithmic topics.
- function_signature: JSON object describing the primary solution function.
  Example: {{ "method": "solution", "return_type": "int", "params": [{{"name": "s", "type": "String"}}] }}
- reference_solution: a CORRECT, STANDALONE Python script. It MUST read from `sys.stdin`, parse the input, call the solution function, and print the result to `sys.stdout`.
  CRITICAL: The reference_solution MUST be a complete runnable script that produces the EXACT expected_output for every test_case input.
  CRITICAL for empty input: if stdin is empty or blank, the solution must handle it gracefully (return 0, "", or appropriate default — do NOT crash).

Respond with ONLY valid JSON:
{{
  "title": "string",
  "description": "string",
  "constraints": ["string", ...],
  "examples": [
    {{ "input": "string", "output": "string", "explanation": "string" }}
  ],
  "test_cases": [
    {{ "input": "string", "expected_output": "string", "is_hidden": false }},
    {{ "input": "string", "expected_output": "string", "is_hidden": true }}
  ],
  "starter_code": {{
    "python": "import sys\\n\\ndef solution(s: str) -> int:\\n    # Write your solution here\\n    pass\\n\\nif __name__ == '__main__':\\n    line = sys.stdin.read().strip()\\n    print(solution(line))",
    "java": "import java.util.Scanner;\\n\\nclass Solution {{\\n    public int solution(String s) {{\\n        // Write your solution here\\n        return 0;\\n    }}\\n}}\\n\\npublic class Main {{\\n    public static void main(String[] args) {{\\n        Scanner sc = new Scanner(System.in);\\n        String s = sc.hasNextLine() ? sc.nextLine() : \\\"\\\";\\n        Solution sol = new Solution();\\n        System.out.println(sol.solution(s));\\n    }}\\n}}",
    "javascript": "const readline = require('readline');\\nconst rl = readline.createInterface({{ input: process.stdin }});\\nconst lines = [];\\nrl.on('line', l => lines.push(l));\\nrl.on('close', () => {{\\n    const s = lines[0] || '';\\n    console.log(solution(s));\\n}});\\n\\nfunction solution(s) {{\\n    // Write your solution here\\n}}",
    "cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\n\\nint solution(string s) {{\\n    // Write your solution here\\n    return 0;\\n}}\\n\\nint main() {{\\n    string s;\\n    getline(cin, s);\\n    cout << solution(s) << endl;\\n    return 0;\\n}}",
    "go": "package main\\n\\nimport (\\n    \\"bufio\\"\\n    \\"fmt\\"\\n    \\"os\\"\\n    \\"strings\\"\\n)\\n\\nfunc solution(s string) int {{\\n    // Write your solution here\\n    return 0\\n}}\\n\\nfunc main() {{\\n    reader := bufio.NewReader(os.Stdin)\\n    s, _ := reader.ReadString('\\\\n')\\n    s = strings.TrimSpace(s)\\n    fmt.Println(solution(s))\\n}}"
  }},
  "function_signature": {{
    "method": "solution",
    "return_type": "int",
    "params": [{{"name": "s", "type": "String"}}]
  }},
  "time_limit_minutes": 20,
  "topics": ["string", ...],
  "difficulty": "easy|medium|hard",
  "approach_hint": "string — one-line hint",
  "reference_solution": "import sys\\n\\ndef solution(s):\\n    return sum(1 for c in s if c in 'AEIOUaeiou')\\n\\nif __name__ == '__main__':\\n    line = sys.stdin.read().strip()\\n    print(solution(line))"
}}"""


# ── Test case validation ───────────────────────────────────────────────────────

def _validate_and_fix_test_cases(problem: dict) -> dict:
    """
    Run the LLM-generated reference_solution through Judge0 to verify
    test case expected_outputs.  Corrects wrong expected outputs in-place.
    Drops test cases that crash the reference solution.

    This prevents hallucinated expected outputs from penalising correct candidate code.
    """
    reference_solution = problem.get("reference_solution", "").strip()
    test_cases = problem.get("test_cases", [])

    if not reference_solution or not test_cases:
        logger.warning("Skipping test case validation: no reference_solution or no test_cases")
        return problem

    # Import here to avoid circular imports at module load time
    try:
        from app.services import judge_service
    except ImportError:
        logger.warning("judge_service not available — skipping test case validation")
        return problem

    logger.info(
        "Validating %d test cases for '%s' using reference solution",
        len(test_cases), problem.get("title", "?"),
    )

    corrected: list[dict] = []
    corrections = 0
    drops = 0

    for i, tc in enumerate(test_cases):
        stdin    = tc.get("input", "")
        expected = tc.get("expected_output", "").strip()

        try:
            result = judge_service.run_code("python", reference_solution, stdin)
        except Exception as exc:
            logger.error("Reference solution run failed for TC %d: %s", i, exc)
            drops += 1
            continue

        if result.get("execution_error"):
            # Judge0 is unavailable — trust the LLM output, keep the test case
            logger.warning("Judge0 unavailable during validation — keeping TC %d as-is", i)
            corrected.append(tc)
            continue

        actual = (result.get("stdout") or "").strip()
        status = result.get("status", "")

        if "error" in status.lower() or "compilation" in status.lower():
            # Reference solution itself is broken — drop this test case
            logger.warning("Reference solution errored on TC %d (%s) — dropping", i, status)
            drops += 1
            continue

        if not actual:
            logger.warning("Reference solution produced no output for TC %d (likely not a standalone script). Keeping original expected.", i)
            corrected.append(tc)
            continue

        if actual != expected:
            logger.info(
                "TC %d corrected: expected=%r → actual=%r (stdin=%r)",
                i, expected, actual, stdin[:80],
            )
            tc = dict(tc)
            tc["expected_output"] = actual
            corrections += 1

        corrected.append(tc)

    logger.info(
        "Validation done: %d kept, %d corrected, %d dropped",
        len(corrected), corrections, drops,
    )

    # Ensure we have at least 2 visible test cases
    visible = [tc for tc in corrected if not tc.get("is_hidden", False)]
    if len(visible) < 2:
        logger.warning("Too few visible test cases after validation (%d) — keeping originals", len(visible))
        return problem  # fallback: keep original unvalidated test cases

    problem["test_cases"] = corrected
    return problem


# ── Main API ──────────────────────────────────────────────────────────────────


def _fetch_leetcode_problem(title: str) -> dict | None:
    slug = title.lower().replace(" ", "-")
    slug = re.sub(r'[^a-z0-9\-]', '', slug)
    url = f"https://alfa-leetcode-api.onrender.com/select?titleSlug={urllib.parse.quote(slug)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8.0) as response:
            data = json.loads(response.read().decode())
            if "questionTitle" in data and "question" in data:
                return data
    except Exception as exc:
        logger.warning(f"Failed to fetch LeetCode problem {slug}: {exc}")
    return None

def select_problem(
    company_intel: dict,
    difficulty: str,
    previously_asked_titles: list[str],
) -> dict:
    """
    Select or generate a coding problem for the coding round.
    """
    client = get_llm_client()

    company_name = company_intel.get("company_name", "the target company")
    diff_label   = difficulty if difficulty in {"easy", "medium", "hard"} else "medium"

    # ── 1. Determine a candidate title ────────────────────────────────────────
    candidate_titles = []
    
    # Check intel problems
    for p in company_intel.get("coding_problems", []):
        t = p.get("title") or str(p)
        if t not in previously_asked_titles:
            candidate_titles.append(t)
            
    # Check reported questions
    for q in company_intel.get("real_coding_questions_reported", []):
        if q not in previously_asked_titles:
            candidate_titles.append(q)
            
    # Fallback to bank
    if not candidate_titles:
        bank = get_company_problems_by_difficulty(company_name, diff_label) or get_company_problems(company_name)
        for p in bank:
            if p.get("title", "") not in previously_asked_titles:
                candidate_titles.append(p.get("title"))
                
    if not candidate_titles:
        candidate_titles = ["Two Sum", "LRU Cache", "Number of Islands"]
        
    selected_title = random.choice(candidate_titles[:5])
    
    # ── 2. Fetch authentic problem data from LeetCode API ─────────────────────
    authentic_data = _fetch_leetcode_problem(selected_title)
    
    if authentic_data:
        logger.info(f"Successfully fetched authentic problem data for: {selected_title}")
        user_prompt = (
            f"Company: {company_name}\n"
            f"Target difficulty: {diff_label}\n"
            f"Time limit: {TIME_LIMITS[diff_label]} minutes\n"
            f"Problem Title: {authentic_data['questionTitle']}\n"
            f"Authentic HTML Description & Constraints:\n{authentic_data['question']}\n"
            f"Authentic Public Examples:\n{authentic_data.get('exampleTestcases', '')}\n\n"
            "INSTRUCTIONS:\n"
            "1. You MUST use the exact Problem Title, Description, and Constraints provided above.\n"
            "2. Convert the HTML Description to clean Markdown for the 'description' field.\n"
            "3. Generate EXACTLY 8-10 test cases total.\n"
            "4. Make sure 2-3 test cases are 'is_hidden: false' (matching the public examples).\n"
            "5. The remaining test cases MUST be 'is_hidden: true' rigorous edge-case and stress tests (e.g. empty input, large N, negative numbers, boundary limits based on constraints).\n"
            "6. The reference_solution MUST be correct Python that produces exact expected_output for every test case.\n"
            "7. The reference_solution MUST handle empty/blank stdin gracefully without crashing."
        )
    else:
        logger.warning(f"Failed to fetch authentic data for {selected_title}. Falling back to standard LLM generation.")
        tech_focus = company_intel.get("technical_emphasis", []) or company_intel.get("focus_areas", [])
        user_prompt = (
            f"Company: {company_name}\n"
            f"Target difficulty: {diff_label}\n"
            f"Time limit: {TIME_LIMITS[diff_label]} minutes\n"
            f"Company's technical emphasis: {tech_focus}\n"
            f"Problems already asked this session (DO NOT reuse): {previously_asked_titles}\n"
            f"Target Problem Title to Generate: {selected_title}\n\n"
            "INSTRUCTIONS:\n"
            "1. Write a COMPLETE, self-contained problem spec for the Target Problem Title above.\n"
            "2. Do NOT just list the title — write the full description, examples, constraints, and test cases.\n"
            "3. Generate EXACTLY 8-10 test cases (mix of visible edge cases and hidden stress tests).\n"
            "4. The reference_solution MUST be correct Python that produces exact expected_output for every test case.\n"
            "5. The reference_solution MUST handle empty/blank stdin gracefully without crashing."
        )

    try:
        problem = client.complete_json(_PROBLEM_PROMPT, user_prompt)
        return _validate_test_cases(problem)
    except Exception as exc:
        logger.error("Coding question agent LLM call failed: %s", exc)
        return _fallback_problem(diff_label)

def _fallback_problem(difficulty: str) -> dict:
    """Return a safe hardcoded fallback when the LLM call fails."""
    time_limit = TIME_LIMITS.get(difficulty, 20)
    return {
        "title": "Two Sum",
        "description": (
            "Given an array of integers `nums` and an integer `target`, "
            "return the indices of the two numbers such that they add up to `target`.\n\n"
            "You may assume that each input would have exactly one solution, "
            "and you may not use the same element twice. "
            "You can return the answer in any order."
        ),
        "constraints": [
            "2 ≤ nums.length ≤ 10⁴",
            "-10⁹ ≤ nums[i] ≤ 10⁹",
            "-10⁹ ≤ target ≤ 10⁹",
            "Only one valid answer exists.",
        ],
        "examples": [
            {"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "2 + 7 = 9"},
            {"input": "nums = [3,2,4], target = 6",     "output": "[1,2]", "explanation": "2 + 4 = 6"},
        ],
        "test_cases": [
            {"input": "2 7 11 15\n9",  "expected_output": "0 1",  "is_hidden": False},
            {"input": "3 2 4\n6",       "expected_output": "1 2",  "is_hidden": False},
            {"input": "0\n0",           "expected_output": "0 0",  "is_hidden": False},  # edge: single pair
            {"input": "3 3\n6",         "expected_output": "0 1",  "is_hidden": True},   # edge: duplicate
            {"input": "-1 -2 -3 -4\n-7","expected_output": "2 3", "is_hidden": True},   # edge: negatives
        ],
        "starter_code": {
            "python":     "from typing import List\n\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass",
            "java":       "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        \n    }\n}",
            "javascript": "var twoSum = function(nums, target) {\n    \n};",
            "cpp":        "#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        \n    }\n};",
            "go":         "func twoSum(nums []int, target int) []int {\n    \n}",
        },
        "function_signature": {
            "method":      "twoSum",
            "return_type": "int[]",
            "params": [
                {"name": "nums",   "type": "int[]"},
                {"name": "target", "type": "int"},
            ],
        },
        "time_limit_minutes": time_limit,
        "topics": ["array", "hash map"],
        "difficulty": difficulty,
        "approach_hint": "Consider using a hash map to store the complement of each number.",
        "reference_solution": (
            "import sys\n"
            "def twoSum(nums, target):\n"
            "    seen = {}\n"
            "    for i, n in enumerate(nums):\n"
            "        if target - n in seen:\n"
            "            return [seen[target - n], i]\n"
            "        seen[n] = i\n"
            "if __name__ == '__main__':\n"
            "    lines = sys.stdin.read().split()\n"
            "    if len(lines) >= 1:\n"
            "        nums = [int(x) for x in lines[:-1]]\n"
            "        target = int(lines[-1])\n"
            "        res = twoSum(nums, target)\n"
            "        print(f'{res[0]} {res[1]}')\n"
        ),
    }
