from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "SmartWAN Platform API"
    app_version: str = "0.1.0"
    debug: bool = False
    cors_origins: str = "http://localhost:5173,https://smartwan-platform.vercel.app"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # Claude API
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"      # 하위 호환 폴백 (Sprint 2-5 추천 엔진)

    # Phase 3 ModelRouter — Haiku/Sonnet/Opus 분기 (미설정 시 하드코딩 기본값 사용)
    claude_model_haiku: str = "claude-haiku-4-5-20251001"
    claude_model_sonnet: str = "claude-sonnet-4-6"
    claude_model_opus: str = "claude-opus-4-6"

    # 조직 단위 분당 호출 캡 (0 = 무제한)
    ai_rate_limit_per_org_per_min: int = 60

    # Notion (module catalog sync)
    notion_api_key: str = ""
    notion_module_db_id: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
