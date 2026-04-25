"""
LLM Service factory and facade.
Selects the correct provider based on LLM_PROVIDER env var.
"""
from typing import Any, Dict, List
from app.core.config import settings
from app.services.agent.providers.base import BaseLLMProvider


def get_llm_provider() -> BaseLLMProvider:
    """Factory function: returns the configured LLM provider."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        from app.services.agent.providers.openai_provider import OpenAIProvider
        return OpenAIProvider()

    if provider == "ollama":
        from app.services.agent.providers.ollama_provider import OllamaProvider
        return OllamaProvider()

    # Default: mock provider (no API key needed)
    from app.services.agent.providers.mock_provider import MockLLMProvider
    return MockLLMProvider()


class LLMService:
    """Facade for LLM operations. Swappable provider via environment variable."""

    def __init__(self):
        self._provider: BaseLLMProvider = get_llm_provider()

    def analyze_finances(self, data: Dict[str, Any]) -> Dict[str, Any]:
        return self._provider.analyze_finances(data)

    def generate_recommendations(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        return self._provider.generate_recommendations(data)

    def explain_summary(self, data: Dict[str, Any]) -> str:
        return self._provider.explain_summary(data)

    def chat(self, user_input: str, context: Dict[str, Any]) -> str:
        return self._provider.chat(user_input, context)
