"""
Fintoc bank provider adapter.
Documentation: https://docs.fintoc.com

NOTE: This is a MOCK implementation for development.
Set FINTOC_SECRET_KEY in .env to use the real API.
"""
import os
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import httpx

from app.core.config import settings
from app.services.bank_providers.base import BaseBankProvider


class FintocProvider(BaseBankProvider):
    """Fintoc API adapter."""

    def __init__(self):
        self.base_url = settings.FINTOC_BASE_URL
        self.secret_key = settings.FINTOC_SECRET_KEY

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    def connect(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """
        In Fintoc, connection is done via Fintoc Widget (frontend).
        This method stores the link_token returned by the widget.
        """
        link_token = credentials.get("link_token")
        if not link_token:
            raise ValueError("link_token is required")

        if not self.secret_key:
            # Mock response for development
            return {
                "access_token": "fintoc_mock_token_xyz123",
                "link_id": "mock_link_id",
                "institution": {"name": "Banco Demo", "country": "cl"},
                "mock": True,
            }

        # Real Fintoc API call would go here
        # response = httpx.post(f"{self.base_url}/links", ...)
        return {"link_token": link_token, "status": "connected"}

    def get_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        """Retrieve accounts from Fintoc."""
        if not self.secret_key or access_token.startswith("fintoc_mock"):
            return self._mock_accounts()

        with httpx.Client() as client:
            response = client.get(
                f"{self.base_url}/accounts",
                headers={**self._headers(), "Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
            return response.json().get("data", [])

    def get_movements(
        self,
        access_token: str,
        account_id: str,
        since: Optional[str] = None,
        until: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve movements from Fintoc."""
        if not self.secret_key or access_token.startswith("fintoc_mock"):
            return self._mock_movements()

        params: Dict[str, Any] = {}
        if since:
            params["since"] = since
        if until:
            params["until"] = until

        with httpx.Client() as client:
            response = client.get(
                f"{self.base_url}/accounts/{account_id}/movements",
                headers={**self._headers(), "Authorization": f"Bearer {access_token}"},
                params=params,
            )
            response.raise_for_status()
            return response.json().get("data", [])

    def sync(self, access_token: str, account_id: str) -> Dict[str, Any]:
        movements = self.get_movements(access_token, account_id)
        return {"synced_count": len(movements), "movements": movements}

    # ---- Mock data for development ----
    def _mock_accounts(self) -> List[Dict[str, Any]]:
        return [
            {"id": "mock_acc_1", "name": "Cuenta Corriente", "type": "checking_account", "balance": 1250000, "currency": "CLP"},
            {"id": "mock_acc_2", "name": "Cuenta Vista", "type": "savings_account", "balance": 450000, "currency": "CLP"},
        ]

    def _mock_movements(self) -> List[Dict[str, Any]]:
        today = datetime.today()
        return [
            {"id": "mov_1", "date": str((today - timedelta(days=1)).date()), "description": "JUMBO ARAUCO", "amount": -45000, "currency": "CLP", "type": "expense"},
            {"id": "mov_2", "date": str((today - timedelta(days=3)).date()), "description": "TRANSFERENCIA RECIBIDA EMPRESA S.A.", "amount": 1500000, "currency": "CLP", "type": "income"},
            {"id": "mov_3", "date": str((today - timedelta(days=5)).date()), "description": "NETFLIX.COM", "amount": -8990, "currency": "CLP", "type": "expense"},
        ]
