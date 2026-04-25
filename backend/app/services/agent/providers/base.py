"""
Base interface for LLM providers.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseLLMProvider(ABC):
    """Abstract base class for LLM provider adapters."""

    @abstractmethod
    def analyze_finances(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze financial data and return structured analysis."""
        ...

    @abstractmethod
    def generate_recommendations(self, data: Dict[str, Any]) -> List[Dict[str, str]]:
        """Generate actionable recommendations from financial data."""
        ...

    @abstractmethod
    def explain_summary(self, data: Dict[str, Any]) -> str:
        """Generate a natural language summary of finances."""
        ...

    @abstractmethod
    def chat(self, user_input: str, context: Dict[str, Any]) -> str:
        """Chat with the financial agent using context."""
        ...
