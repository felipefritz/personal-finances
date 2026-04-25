"""
Base interface for bank provider adapters.
All providers must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseBankProvider(ABC):
    """Abstract base class for bank provider integrations."""

    @abstractmethod
    def connect(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Initiate bank connection and return connection info."""
        ...

    @abstractmethod
    def get_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        """Retrieve list of bank accounts for the connected user."""
        ...

    @abstractmethod
    def get_movements(
        self,
        access_token: str,
        account_id: str,
        since: Optional[str] = None,
        until: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve movements/transactions for a given account."""
        ...

    @abstractmethod
    def sync(self, access_token: str, account_id: str) -> Dict[str, Any]:
        """Sync all movements for an account."""
        ...
