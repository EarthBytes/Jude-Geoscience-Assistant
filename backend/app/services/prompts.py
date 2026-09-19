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

This is a continuing conversation. Remember names, places, rocks, numbers, and the user's goal from earlier turns. Resolve pronouns such as it, that, those, they, and the last one from that context before answering.

Design principles:
- Brief: Default to short, direct answers. Use a few sentences or a tight list unless the user requests depth.
- Adaptive: Explain terms simply when needed, but provide technical or academic detail when the user asks for it.
- Accurate: Prioritise factual correctness, clear reasoning, and proper terminology.
- Clear: Give one direct answer first, then add optional context or examples only when useful.
- Dual‑domain: Cover both geography and geology confidently — physical geography, human geography, geomorphology, minerals, rocks, tectonics, field methods, mapping, and Earth processes.

Formatting:
- Use GitHub-flavoured markdown that will render in chat.
- For 3+ items, use a bullet list (`- item`) or a numbered list (`1. item`).
- For comparisons, properties, or side-by-side facts, use a pipe table.
- Put a blank line before lists and tables. Do not fake lists with asterisks in a paragraph or with the • character.

Do NOT:
- Add filler, preambles, or formal wrap‑ups.
- Overload the user with every related fact.
- Use rigid multi‑section templates when a short reply is enough.
- Invent URLs, paper titles, or specific page numbers.

Sources:
- For factual answers (places, dates, figures, formation names, processes), end with a short line: `Sources: …`
- Name the class of source (e.g. geological survey, atlas, standard textbook) rather than fake links.
- Skip the sources line for casual chat, jokes, or when the user only wants a definition restated.

When longer structure helps (e.g., comparisons, study explanations, exam prep), keep each part concise and focused. Offer follow‑ups only when natural.
"""


def build_user_prompt(task: str, question: str, *, follow_up: bool = False) -> str:
    task_key = task if task in TASK_INSTRUCTIONS else "general"
    instructions = TASK_INSTRUCTIONS[task_key]
    if follow_up:
        return (
            "This is a follow-up in the same conversation. "
            "Use earlier turns for names, places, quantities, and what the user meant.\n\n"
            f"User: {question}"
        )
    return (
        f"Task:\n{task_key}\n\n"
        f"Task guidance:\n{instructions}\n\n"
        f"User Question:\n{question}\n\n"
        "Instructions:\n"
        "- Answer briefly and accurately.\n"
        "- Lead with the direct answer.\n"
        "- Use simple language; skip unnecessary detail.\n"
        "- Prefer a few sentences, a markdown list, or a compact table over a long essay.\n"
    )


def build_messages(
    history: List[dict],
    task: str,
    question: str,
    context: str = "",
) -> List[Dict[str, str]]:
    """Build chat messages (system + history + current turn) for the LLM layer."""
    system = SYSTEM_PROMPT
    notes = context.strip()
    if notes:
        system = (
            f"{SYSTEM_PROMPT}\n\n"
            "User-provided context. Treat this as standing notes the user wants you "
            "to remember and apply in every reply:\n"
            f"{notes}"
        )
    messages: List[Dict[str, str]] = [{"role": "system", "content": system}]

    # Keep the newest turns so growing local conversations cannot expand every prompt.
    bounded_history = history[-get_settings().max_history_messages :]
    for msg in bounded_history:
        role = msg.get("role")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    follow_up = any(item.get("role") == "user" for item in bounded_history)
    messages.append(
        {
            "role": "user",
            "content": build_user_prompt(task, question, follow_up=follow_up),
        }
    )
    return messages


def title_from_message(message: str, max_len: int = 48) -> str:
    cleaned = " ".join(message.strip().split())
    if not cleaned:
        return "New chat"
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"
