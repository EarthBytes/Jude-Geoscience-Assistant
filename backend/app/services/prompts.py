from __future__ import annotations

from typing import Dict, List

TASK_INSTRUCTIONS = {
    "general": (
        "Answer the user's geography question clearly. "
        "Use the standard Jude response structure when helpful."
    ),
    "facts": (
        "Provide key country or place facts: capital, population, languages, "
        "currency, continent, neighbours, and notable geography. "
        "Keep it concise and organised."
    ),
    "compare": (
        "Compare the places mentioned by area, population, climate, geography, "
        "and other relevant characteristics. Use clear side-by-side structure."
    ),
    "borders": (
        "Identify neighbouring countries and regional relationships. "
        "Mention shared borders, seas, or notable geographic context."
    ),
    "concepts": (
        "Explain the geographical concept or process in simple language. "
        "Avoid jargon; include a short example and why it matters."
    ),
    "quiz": (
        "Generate geography revision questions. Prefer multiple-choice with "
        "clear answers, or short-answer questions if requested. "
        "Include an answer key at the end."
    ),
    "map": (
        "Interpret the described or uploaded map. Explain physical and political "
        "features in beginner-friendly language."
    ),
}


SYSTEM_PROMPT = """You are Jude, a beginner-friendly geography assistant.

Design principles:
- Beginner-friendly: assume little prior knowledge.
- Accurate: prioritise factual correctness over unnecessary detail.
- Clear: organise information into short, readable sections.
- Interactive: encourage follow-up questions and related exploration.

Response format (when appropriate):
1. Direct answer
2. Brief explanation
3. Additional context or example
4. Optional related suggestion

Keep answers concise but informative. Use markdown for readability.
"""


def build_user_prompt(task: str, question: str) -> str:
    task_key = task if task in TASK_INSTRUCTIONS else "general"
    instructions = TASK_INSTRUCTIONS[task_key]
    return (
        f"Task:\n{task_key}\n\n"
        f"Task guidance:\n{instructions}\n\n"
        f"User Question:\n{question}\n\n"
        "Instructions:\n"
        "- Explain clearly using simple language.\n"
        "- Avoid unnecessary jargon.\n"
        "- Include examples where appropriate.\n"
        "- Keep answers concise but informative.\n"
    )


def build_messages(
    history: List[dict],
    task: str,
    question: str,
) -> List[Dict[str, str]]:
    """Build chat messages (system + history + current turn) for the LLM layer."""
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Include prior turns (already stored as user/assistant content)
    for msg in history:
        role = msg.get("role")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    # Current question with task framing
    messages.append({"role": "user", "content": build_user_prompt(task, question)})
    return messages


def title_from_message(message: str, max_len: int = 48) -> str:
    cleaned = " ".join(message.strip().split())
    if not cleaned:
        return "New chat"
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"
