from __future__ import annotations

from typing import Optional

_HARMFUL_PATTERNS = (
    "build a bomb",
    "make an explosive",
    "make explosives",
    "evade evacuation",
    "bypass evacuation",
    "harm myself",
    "kill myself",
)


def blocked_request(message: str) -> Optional[str]:
    """Return a safe redirect for clearly harmful requests, otherwise ``None``.

    This is not general-purpose moderation; it deliberately catches only obvious
    requests for harm or evading emergency safety measures.
    """
    normalized = " ".join(message.lower().split())
    if any(pattern in normalized for pattern in _HARMFUL_PATTERNS):
        return (
            "I can't help with instructions that could cause harm or bypass emergency "
            "safety measures. For an immediate hazard, follow local emergency guidance."
        )
    return None
