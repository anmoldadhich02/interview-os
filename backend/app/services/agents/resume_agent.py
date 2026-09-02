"""
Resume Intelligence Agent.

Single responsibility: turn raw resume text into a structured
CandidateProfile (skills, projects, experience, education, achievements,
certifications, seniority estimate).
"""
from app.services.llm_client import get_llm_client

SYSTEM_PROMPT = """You are the Resume Intelligence Agent inside an AI interview \
platform. You read a candidate's resume text and extract a structured profile. \
Respond with ONLY a JSON object with this exact shape:
{
  "skills": ["string", ...],
  "projects": [{"name": "string", "description": "string", "technologies": ["string"]}],
  "experience": [{"company": "string", "role": "string", "duration": "string", "highlights": ["string"]}],
  "education": [{"institution": "string", "degree": "string", "year": "string"}],
  "achievements": ["string", ...],
  "certifications": ["string", ...],
  "seniority_estimate": "intern" | "junior" | "mid" | "senior" | "staff"
}
Be accurate and only use information present in the resume text. Do not invent details."""


def analyze_resume(raw_text: str) -> dict:
    client = get_llm_client()
    user_prompt = f"Resume text:\n\n{raw_text[:12000]}"
    return client.complete_json(SYSTEM_PROMPT, user_prompt)
