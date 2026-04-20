from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[REPO_ROOT / ".env.local", REPO_ROOT / ".env"],
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    career_gemini_key: str = Field(default="")
    next_public_supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    next_public_supabase_anon_key: str = Field(default="")
    supabase_jwt_secret: str = Field(default="")

    ranking_xlsx_path: Path = Field(default=REPO_ROOT / "기간별 순위 취합.xlsx")
    prompts_dir: Path = Field(default=REPO_ROOT / "prompts")

    debug: bool = Field(default=False)
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])


@lru_cache
def get_settings() -> Settings:
    return Settings()
