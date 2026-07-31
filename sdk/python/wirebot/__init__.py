"""
Wirebot Python SDK

Official client library for the Wirebot WhatsApp API Gateway.

Example usage::

    from wirebot import WirebotClient

    client = WirebotClient(
        base_url="http://localhost:2785",
        api_key="your-api-key",
    )

    # Send a text message
    result = client.messages.send_text("session-1", {
        "chatId": "628123456789@c.us",
        "text": "Hello from Wirebot Python SDK!",
    })
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WirebotClientConfig:
    """Configuration for the Wirebot client."""

    base_url: str
    api_key: str
    timeout: float = 30.0


@dataclass
class MessageResponse:
    """Response from sending a message."""

    message_id: str
    timestamp: int


class WirebotClient:
    """Wirebot API client.

    This is a scaffold — methods will be auto-generated from the OpenAPI spec.
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self.config = WirebotClientConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            timeout=timeout,
        )

    # Placeholder — will be auto-generated from OpenAPI spec
    @property
    def sessions(self) -> "_SessionsResource":
        return _SessionsResource(self)

    @property
    def messages(self) -> "_MessagesResource":
        return _MessagesResource(self)

    def _request(self, method: str, path: str, json: Any = None) -> Any:
        """Internal HTTP request helper. Requires httpx."""
        try:
            import httpx
        except ImportError:
            raise ImportError(
                "httpx is required for the Wirebot SDK. "
                "Install it with: pip install wirebot-sdk"
            )

        with httpx.Client(timeout=self.config.timeout) as client:
            response = client.request(
                method,
                f"{self.config.base_url}{path}",
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": self.config.api_key,
                },
                json=json,
            )
            response.raise_for_status()

            if response.status_code == 204:
                return None

            return response.json()


class _SessionsResource:
    def __init__(self, client: WirebotClient) -> None:
        self._client = client

    def list(self) -> list[dict]:
        return self._client._request("GET", "/api/sessions")

    def get(self, session_id: str) -> dict:
        return self._client._request("GET", f"/api/sessions/{session_id}")

    def create(self, name: str) -> dict:
        return self._client._request("POST", "/api/sessions", {"name": name})

    def start(self, session_id: str) -> dict:
        return self._client._request("POST", f"/api/sessions/{session_id}/start")

    def stop(self, session_id: str) -> dict:
        return self._client._request("POST", f"/api/sessions/{session_id}/stop")

    def delete(self, session_id: str) -> None:
        self._client._request("DELETE", f"/api/sessions/{session_id}")


class _MessagesResource:
    def __init__(self, client: WirebotClient) -> None:
        self._client = client

    def send_text(
        self, session_id: str, data: dict[str, str]
    ) -> MessageResponse:
        result = self._client._request(
            "POST", f"/api/sessions/{session_id}/messages/text", data
        )
        return MessageResponse(
            message_id=result["messageId"],
            timestamp=result["timestamp"],
        )
