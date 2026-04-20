from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import TYPE_CHECKING, AsyncIterator, TypeVar

if TYPE_CHECKING:
    from google import genai
    from google.genai import types as genai_types

logger = logging.getLogger("career_evaluation.gemini")

_DEFAULT_MODEL = "gemini-flash-latest"

T = TypeVar("T")


@lru_cache(maxsize=1)
def _get_client() -> "genai.Client":
    try:
        from google import genai as _genai
    except ImportError as exc:
        raise RuntimeError(
            "google-genai package is not installed. Add google-genai to dependencies."
        ) from exc
    from app.core.config import get_settings

    return _genai.Client(api_key=get_settings().career_gemini_key)


def parse_json_response(text: str) -> object:
    if not text:
        raise ValueError("empty AI response")
    cleaned = text.strip()
    import re

    cleaned = re.sub(r"^```(?:json|JSON)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Fallback: slice from first { or [ to last } or ]
    first = -1
    for i, ch in enumerate(cleaned):
        if ch in ("{", "["):
            first = i
            break
    last = max(cleaned.rfind("}"), cleaned.rfind("]"))
    if first != -1 and last > first:
        slice_ = cleaned[first : last + 1]
        try:
            return json.loads(slice_)
        except json.JSONDecodeError:
            pass
    raise ValueError(f"AI returned non-JSON: {cleaned[:200]}")


def _build_config(enable_search: bool = False) -> dict:
    """Build generate_content config dict compatible with google-genai>=1.0."""
    try:
        from google.genai import types

        thinking_config = None
        try:
            thinking_config = types.ThinkingConfig(thinking_budget=0)
        except (TypeError, AttributeError):
            pass

        kwargs: dict = {"temperature": 0.0}
        if thinking_config is not None:
            kwargs["thinking_config"] = thinking_config

        config = types.GenerateContentConfig(
            **kwargs,
        )
        return {"config": config}
    except ImportError:
        return {}


def _build_tools(enable_search: bool) -> list | None:
    if not enable_search:
        return None
    try:
        from google.genai import types

        return [types.Tool(google_search=types.GoogleSearch())]
    except (ImportError, AttributeError):
        return None


async def call_gemini(
    system_prompt: str,
    user_prompt: str,
    *,
    model: str = _DEFAULT_MODEL,
) -> str:
    client = _get_client()
    try:
        from google.genai import types

        config_kwargs = _build_config(enable_search=False)
        if "config" in config_kwargs:
            config_kwargs["config"].system_instruction = system_prompt
        else:
            config_kwargs["config"] = types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.0,
            )
        response = await client.aio.models.generate_content(
            model=model,
            contents=user_prompt,
            **config_kwargs,
        )
        return response.text or ""
    except ImportError as exc:
        raise RuntimeError("google-genai package is not installed") from exc


async def call_gemini_with_search(
    system_prompt: str,
    user_prompt: str,
    *,
    model: str = _DEFAULT_MODEL,
) -> str:
    client = _get_client()
    try:
        from google.genai import types

        tools = _build_tools(enable_search=True)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.0,
            tools=tools,
        )
        response = await client.aio.models.generate_content(
            model=model,
            contents=user_prompt,
            config=config,
        )
        return response.text or ""
    except ImportError as exc:
        raise RuntimeError("google-genai package is not installed") from exc


async def call_gemini_with_document(
    system_prompt: str,
    user_prompt: str,
    pdf_bytes: bytes,
    *,
    model: str = _DEFAULT_MODEL,
) -> str:
    client = _get_client()
    try:
        from google.genai import types

        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        text_part = types.Part.from_text(text=user_prompt)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.0,
        )
        response = await client.aio.models.generate_content(
            model=model,
            contents=[pdf_part, text_part],
            config=config,
        )
        return response.text or ""
    except ImportError as exc:
        raise RuntimeError("google-genai package is not installed") from exc


async def call_gemini_stream(
    system_prompt: str,
    user_prompt: str,
    *,
    model: str = _DEFAULT_MODEL,
    temperature: float = 0.0,
) -> AsyncIterator[str]:
    client = _get_client()
    try:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
        )
        async for chunk in await client.aio.models.generate_content_stream(
            model=model,
            contents=user_prompt,
            config=config,
        ):
            if chunk.text:
                yield chunk.text
    except ImportError as exc:
        raise RuntimeError("google-genai package is not installed") from exc


async def call_gemini_with_document_stream(
    system_prompt: str,
    user_prompt: str,
    pdf_bytes: bytes,
    *,
    model: str = _DEFAULT_MODEL,
) -> AsyncIterator[str]:
    client = _get_client()
    try:
        from google.genai import types

        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        text_part = types.Part.from_text(text=user_prompt)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.0,
        )
        async for chunk in await client.aio.models.generate_content_stream(
            model=model,
            contents=[pdf_part, text_part],
            config=config,
        ):
            if chunk.text:
                yield chunk.text
    except ImportError as exc:
        raise RuntimeError("google-genai package is not installed") from exc
