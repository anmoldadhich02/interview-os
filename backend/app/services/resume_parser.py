"""
Extracts raw text from an uploaded PDF resume. Kept separate from the
Resume Intelligence Agent (which turns raw text into a structured profile)
so that parsing strategy can evolve independently (e.g. OCR fallback).
"""
import io

from pypdf import PdfReader


def extract_text_from_pdf(file_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for page in reader.pages:
        pages_text.append(page.extract_text() or "")
    text = "\n".join(pages_text).strip()
    if not text:
        raise ValueError(
            "Could not extract any text from this PDF. It may be a scanned "
            "image without embedded text."
        )
    return text
