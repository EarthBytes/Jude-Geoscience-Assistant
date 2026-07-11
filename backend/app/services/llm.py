from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from google import genai
from google.genai import types
from groq import AsyncGroq

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

TEMPERATURE = 0.4

# Substrings / signals that indicate Gemini free-tier quota or rate limits.
_QUOTA_MARKERS = (
    "429",
    "resource_exhausted",
    "resource exhausted",
    "quota exceeded",
    "exceeded your current quota",
    "rate limit",
    "rate_limit",
    "ratelimit",
    "too many requests",
    "resource has been exhausted",
)

# Transient / model-availability failures worth retrying on the lite model.
_RETRYABLE_MARKERS = (
    "503",
    "unavailable",
    "high demand",
    "404",
    "not_found",
    "no longer available",
)


class LLMError(Exception):
    pass


def _is_quota_or_rate_limit(exc: BaseException) -> bool:
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "code", None)
    if status == 429:
        return True

    # google-genai ClientError often exposes .status
    status_name = str(getattr(exc, "status", "") or "").upper()
    if status_name in {"RESOURCE_EXHAUSTED", "TOO_MANY_REQUESTS"}:
        return True

    message = str(exc).lower()
    return any(marker in message for marker in _QUOTA_MARKERS)


def _is_retryable_model_error(exc: BaseException) -> bool:
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "code", None)
    if status in {404, 503}:
        return True

    status_name = str(getattr(exc, "status", "") or "").upper()
    if status_name in {"NOT_FOUND", "UNAVAILABLE"}:
        return True

    message = str(exc).lower()
    return any(marker in message for marker in _RETRYABLE_MARKERS)


def _gemini_models_to_try(settings: Settings) -> List[str]:
    models = [settings.gemini_model]
    lite = settings.gemini_model_lite.strip()
    if lite and lite not in models:
        models.append(lite)
    return models


def _split_messages(
    messages: List[Dict[str, str]],
) -> Tuple[Optional[str], List[Dict[str, Any]], List[Dict[str, str]]]:
    system_parts: List[str] = []
    gemini_contents: List[Dict[str, Any]] = []
    groq_messages: List[Dict[str, str]] = []

    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")
        if not content:
            continue
        if role == "system":
            system_parts.append(content)
            continue
        if role == "assistant":
            gemini_role = "model"
            groq_role = "assistant"
        elif role == "user":
            gemini_role = "user"
            groq_role = "user"
        else:
            continue

        gemini_contents.append(
            {"role": gemini_role, "parts": [{"text": content}]}
        )
        groq_messages.append({"role": groq_role, "content": content})

    system = "\n\n".join(system_parts) if system_parts else None
    if system:
        groq_messages = [{"role": "system", "content": system}, *groq_messages]
    return system, gemini_contents, groq_messages


def _gemini_client(settings: Settings) -> genai.Client:
    api_key = settings.resolved_gemini_api_key
    if not api_key:
        raise LLMError(
            "Gemini is not configured. Set GOOGLE_API_KEY or GEMINI_API_KEY in backend/.env."
        )
    return genai.Client(api_key=api_key)


def _groq_client(settings: Settings) -> AsyncGroq:
    if not settings.groq_configured:
        raise LLMError(
            "Groq is not configured. Set GROQ_API_KEY in backend/.env."
        )
    return AsyncGroq(api_key=settings.groq_api_key.strip())


def _no_provider_error() -> LLMError:
    return LLMError(
        "No LLM API key configured. Set GOOGLE_API_KEY (or GEMINI_API_KEY) "
        "and/or GROQ_API_KEY in backend/.env."
    )


def _gemini_response_text(response: Any) -> str:
    """Extract plain text only — never serialize raw SDK parts (e.g. thought_signature).

    Avoids response.text, which warns when non-text parts like thought_signature
    are present and can be ambiguous for streaming chunks.
    """
    parts_out: List[str] = []
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            # Skip model "thought" channel; only keep user-visible text.
            if getattr(part, "thought", None) is True:
                continue
            part_text = getattr(part, "text", None)
            if isinstance(part_text, str) and part_text:
                parts_out.append(part_text)
    return "".join(parts_out)


async def _generate_gemini(
    settings: Settings, messages: List[Dict[str, str]], model: str
) -> str:
    system, contents, _ = _split_messages(messages)
    if not contents:
        raise LLMError("No user messages provided to the LLM.")

    client = _gemini_client(settings)
    config = types.GenerateContentConfig(
        temperature=TEMPERATURE,
        system_instruction=system,
    )
    response = await client.aio.models.generate_content(
        model=model,
        contents=contents,
        config=config,
    )
    text = _gemini_response_text(response).strip()
    if not text:
        raise LLMError("LLM returned an empty response.")
    return text


async def _stream_gemini(
    settings: Settings, messages: List[Dict[str, str]], model: str
) -> AsyncIterator[str]:
    system, contents, _ = _split_messages(messages)
    if not contents:
        raise LLMError("No user messages provided to the LLM.")

    client = _gemini_client(settings)
    config = types.GenerateContentConfig(
        temperature=TEMPERATURE,
        system_instruction=system,
    )
    stream = await client.aio.models.generate_content_stream(
        model=model,
        contents=contents,
        config=config,
    )
    async for chunk in stream:
        text = _gemini_response_text(chunk)
        if text:
            yield text


async def _generate_groq(
    settings: Settings, messages: List[Dict[str, str]]
) -> str:
    _, _, groq_messages = _split_messages(messages)
    if not any(m["role"] == "user" for m in groq_messages):
        raise LLMError("No user messages provided to the LLM.")

    client = _groq_client(settings)
    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=groq_messages,
        temperature=TEMPERATURE,
    )
    content = response.choices[0].message.content
    if not content:
        raise LLMError("LLM returned an empty response.")
    return content.strip()


async def _stream_groq(
    settings: Settings, messages: List[Dict[str, str]]
) -> AsyncIterator[str]:
    _, _, groq_messages = _split_messages(messages)
    if not any(m["role"] == "user" for m in groq_messages):
        raise LLMError("No user messages provided to the LLM.")

    client = _groq_client(settings)
    stream = await client.chat.completions.create(
        model=settings.groq_model,
        messages=groq_messages,
        temperature=TEMPERATURE,
        stream=True,
    )
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def generate_reply(messages: List[Dict[str, str]]) -> str:
    settings = get_settings()
    if not settings.llm_configured:
        raise _no_provider_error()

    gemini_error: Optional[BaseException] = None

    if settings.gemini_configured:
        models = _gemini_models_to_try(settings)
        for index, model in enumerate(models):
            try:
                return await _generate_gemini(settings, messages, model)
            except LLMError:
                raise
            except Exception as exc:  # noqa: BLE001
                gemini_error = exc
                has_next_gemini = index + 1 < len(models)
                if has_next_gemini and _is_retryable_model_error(exc):
                    logger.warning(
                        "Gemini model %s failed (%s); retrying with %s",
                        model,
                        exc,
                        models[index + 1],
                    )
                    continue
                if _is_quota_or_rate_limit(exc) and settings.groq_configured:
                    logger.warning(
                        "Gemini quota/rate limit hit (%s); falling back to Groq model %s",
                        exc,
                        settings.groq_model,
                    )
                    break
                raise LLMError(f"Gemini request failed: {exc}") from exc

    if settings.groq_configured:
        try:
            return await _generate_groq(settings, messages)
        except LLMError:
            raise
        except Exception as exc:  # noqa: BLE001
            if gemini_error is not None:
                raise LLMError(
                    f"Both providers failed. Gemini: {gemini_error}; Groq: {exc}"
                ) from exc
            raise LLMError(f"Groq request failed: {exc}") from exc

    if gemini_error is not None:
        raise LLMError(f"Gemini request failed: {gemini_error}") from gemini_error
    raise _no_provider_error()


async def stream_reply(messages: List[Dict[str, str]]) -> AsyncIterator[str]:
    settings = get_settings()
    if not settings.llm_configured:
        raise _no_provider_error()

    gemini_error: Optional[BaseException] = None

    if settings.gemini_configured:
        models = _gemini_models_to_try(settings)
        for index, model in enumerate(models):
            started = False
            try:
                async for token in _stream_gemini(settings, messages, model):
                    started = True
                    yield token
                return
            except LLMError:
                raise
            except Exception as exc:  # noqa: BLE001
                if started:
                    raise LLMError(
                        f"Gemini stream failed mid-response: {exc}"
                    ) from exc
                gemini_error = exc
                has_next_gemini = index + 1 < len(models)
                if has_next_gemini and _is_retryable_model_error(exc):
                    logger.warning(
                        "Gemini model %s stream failed (%s); retrying with %s",
                        model,
                        exc,
                        models[index + 1],
                    )
                    continue
                if _is_quota_or_rate_limit(exc) and settings.groq_configured:
                    logger.warning(
                        "Gemini quota/rate limit hit during stream (%s); "
                        "falling back to Groq model %s",
                        exc,
                        settings.groq_model,
                    )
                    break
                raise LLMError(f"Gemini stream failed: {exc}") from exc

    if settings.groq_configured:
        try:
            async for token in _stream_groq(settings, messages):
                yield token
            return
        except LLMError:
            raise
        except Exception as exc:  # noqa: BLE001
            if gemini_error is not None:
                raise LLMError(
                    f"Both providers failed. Gemini: {gemini_error}; Groq: {exc}"
                ) from exc
            raise LLMError(f"Groq stream failed: {exc}") from exc

    if gemini_error is not None:
        raise LLMError(f"Gemini stream failed: {gemini_error}") from gemini_error
    raise _no_provider_error()
