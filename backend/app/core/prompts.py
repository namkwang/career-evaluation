from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger("career_evaluation.prompts")

# name (file stem) -> (system_prompt, user_prompt)
PROMPTS: dict[str, tuple[str, str]] = {}

_SYSTEM_RE = re.compile(r"## System Prompt\s*\n\s*```\n([\s\S]*?)```")
_USER_RE = re.compile(r"## User Prompt\s*\n\s*```\n([\s\S]*?)```")


def _parse_prompt_file(path: Path) -> tuple[str, str]:
    """Extract (system, user) prompt strings from a markdown file."""
    content = path.read_text(encoding="utf-8")

    system_match = _SYSTEM_RE.search(content)
    system_prompt = system_match.group(1).strip() if system_match else ""

    user_match = _USER_RE.search(content)
    user_prompt = user_match.group(1).strip() if user_match else ""

    return system_prompt, user_prompt


def load_all(prompts_dir: Path) -> None:
    """Load all *.md files from prompts_dir into module-level state."""
    if not prompts_dir.exists():
        raise FileNotFoundError(f"prompts dir not found: {prompts_dir}")

    PROMPTS.clear()
    for md_file in sorted(prompts_dir.glob("*.md")):
        system, user = _parse_prompt_file(md_file)
        PROMPTS[md_file.stem] = (system, user)
        logger.debug("loaded prompt: %s", md_file.stem)

    logger.info("loaded %d prompt(s)", len(PROMPTS))


def get_prompt(filename_stem: str) -> tuple[str, str]:
    """Return (system, user) for a prompt by its file stem."""
    try:
        return PROMPTS[filename_stem]
    except KeyError:
        raise KeyError(f"prompt not found: {filename_stem!r}. Available: {list(PROMPTS)}")


# Convenience accessors for the 5 known prompts

def step1_resume() -> tuple[str, str]:
    """Step 1-B: 이력서 추출."""
    return get_prompt("Step1_이력서_추출")


def step1_certificate() -> tuple[str, str]:
    """Step 1-A: 경력증명서 추출."""
    return get_prompt("Step1_경력증명서_추출")


def step2_merge() -> tuple[str, str]:
    """Step 2: 경력 병합 + 회사 확정."""
    return get_prompt("Step2_경력병합")


def step3_employment() -> tuple[str, str]:
    """Step 3: 고용형태 판정."""
    return get_prompt("Step3_고용형태")


def step4_calculation() -> tuple[str, str]:
    """Step 4: 경력산정."""
    return get_prompt("Step4_경력산정")
