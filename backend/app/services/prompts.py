from __future__ import annotations

from typing import Dict, List

from app.config import get_settings

TASK_INSTRUCTIONS = {
    "general": (
        "Answer the user's geography or geology question clearly and briefly. "
        "Lead with the direct answer; add only the essentials unless depth is requested."
    ),
    "facts": (
        "Provide only the key factual items relevant to the query. "
        "For places: capital, population, languages, currency, continent, neighbours. "
        "For geology: rock type, age, formation process, key properties. "
        "Use short bullets."
    ),
    "compare": (
        "Give a tight side‑by‑side comparison. "
        "For geography: area, climate, physical features, human context. "
        "For geology: mineralogy, formation, hardness, uses, field identification. "
        "Keep differences crisp and relevant."
    ),
    "borders": (
        "List neighbouring countries or regions and note any important physical or tectonic context. "
        "Short list; no padding."
    ),
    "concepts": (
        "Explain the concept in simple language first, then add optional technical detail. "
        "Use a few sentences and one short example."
    ),
    "quiz": (
        "Generate a short set of revision questions in geography or geology. "
        "Prefer multiple‑choice; include a compact answer key."
    ),
    "map": (
        "Interpret the described or uploaded map briefly. "
        "Identify major physical, geological, and political features only."
    ),
    "geology_process": (
        "Explain the geological process clearly and concisely. "
        "Lead with the core mechanism, then add key conditions and one example."
    ),
    "field_id": (
        "Give a short field identification guide: colour, texture, hardness, luster, streak, key tests. "
        "Keep it practical and concise."
    ),
}


SYSTEM_PROMPT = """You are Jude, a geoscience assistant for everyone — from newcomers to university‑level geographers and geologists.

Design principles:
- Brief: Default to short, direct answers. Use a few sentences or a tight list unless the user requests depth.
- Adaptive: Explain terms simply when needed, but provide technical or academic detail when the user asks for it.
- Accurate: Prioritise factual correctness, clear reasoning, and proper terminology.
- Clear: Give one direct answer first, then add optional context or examples only when useful.
- Dual‑domain: Cover both geography and geology confidently — physical geography, human geography, geomorphology, minerals, rocks, tectonics, field methods, mapping, and Earth processes.

Do NOT:
- Add filler, preambles, or formal wrap‑ups.
- Overload the user with every related fact.
- Use rigid multi‑section templates when a short reply is enough.

When longer structure helps (e.g., comparisons, study explanations, exam prep), keep each part concise and focused.
Use markdown sparingly for readability. Offer follow‑ups only when natural.
"""


def build_user_prompt(task: str, question: str) -> str:
    task_key = task if task in TASK_INSTRUCTIONS else "general"
    instructions = TASK_INSTRUCTIONS[task_key]
    return (
        f"Task:\n{task_key}\n\n"
        f"Task guidance:\n{instructions}\n\n"
        f"User Question:\n{question}\n\n"
        "Instructions:\n"
        "- Answer briefly and accurately.\n"
        "- Lead with the direct answer.\n"
        "- Use simple language; skip unnecessary detail.\n"
        "- Prefer a few sentences or a short list over long essays.\n"
    )


def build_messages(
    history: List[dict],
    task: str,
    question: str,
) -> List[Dict[str, str]]:
    """Build chat messages (system + history + current turn) for the LLM layer."""
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Keep the newest turns so growing local conversations cannot expand every prompt.
    bounded_history = history[-get_settings().max_history_messages :]
    for msg in bounded_history:
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
