from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_host: str = "localhost"
    database_port: int = 3306
    database_user: str = "root"
    database_password: str = ""
    database_name: str = "exhibition"
    cors_origins: str = (
        "http://localhost:8080,"
        "http://127.0.0.1:8080,"
        "https://exhibition-mocha-sigma.vercel.app,"
        "https://www.conninter.com,"
        "https://conninter.com"
    )
    cors_origin_regex: str = r"https://(.*\.)?vercel\.app|https://(.*\.)?conninter\.com"
    auth_secret: str = "dev-change-me"
    auth_bootstrap_email: str = "admin@conninter.example"
    auth_bootstrap_pin: str = "2026"
    auth_bootstrap_name: str = "Conninter Admin"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    resend_api_key: str = ""
    mail_from: str = "FUNNEL <noreply@conninter.com>"
    mail_enabled: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
