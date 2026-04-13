"""cody_obs — thin client for the Cody observability collector.

Symmetric with the TypeScript SDK (`@cody/obs-js`). Same envelope, same
observe-only pattern: you call the provider SDK yourself, measure
latency, then call `obs.log(...)`.

Two entry points:

- `Obs`:      async, returned by `create_obs(...)`. Fire-and-forget
              dispatch via an internal task set.
- `SyncObs`:  blocking wrapper for scripts that don't want to care about
              asyncio. Returned by `create_sync_obs(...)`.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

import httpx

log = logging.getLogger("cody_obs")

EventStatus = Literal["success", "error"]


@dataclass
class ObsConfig:
    endpoint: str
    api_key: str
    app: str
    timeout_s: float = 5.0


@dataclass
class ObsEvent:
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int | None = None
    status: EventStatus = "success"
    prompt: str | None = None
    response: str | None = None
    session_id: str | None = None
    user_id: str | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)
    timestamp: str | None = None

    def to_payload(self, app: str) -> dict[str, Any]:
        # camelCase keys so the collector's zod schema accepts them.
        return {
            "app": app,
            "model": self.model,
            "provider": self.provider,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "latencyMs": self.latency_ms,
            "status": self.status,
            "prompt": self.prompt,
            "response": self.response,
            "sessionId": self.session_id,
            "userId": self.user_id,
            "metadata": dict(self.metadata),
            "timestamp": self.timestamp,
        }


class Obs:
    """Async client. Dispatches are scheduled onto the running event loop."""

    def __init__(self, config: ObsConfig) -> None:
        self._config = config
        self._client = httpx.AsyncClient(timeout=config.timeout_s)
        self._inflight: set[asyncio.Task[None]] = set()

    async def _dispatch(self, event: ObsEvent) -> None:
        payload = event.to_payload(self._config.app)
        headers = {"x-api-key": self._config.api_key}
        for attempt in (1, 2):
            try:
                resp = await self._client.post(
                    self._config.endpoint, json=payload, headers=headers
                )
                resp.raise_for_status()
                return
            except Exception as err:
                if attempt == 2:
                    log.warning("obs dispatch failed: %s", err)

    async def log(self, event: ObsEvent, *, wait: bool = False) -> None:
        task = asyncio.create_task(self._dispatch(event))
        self._inflight.add(task)
        task.add_done_callback(self._inflight.discard)
        if wait:
            await task

    async def flush(self) -> None:
        if self._inflight:
            await asyncio.gather(*self._inflight, return_exceptions=True)

    async def aclose(self) -> None:
        await self.flush()
        await self._client.aclose()


class SyncObs:
    """Blocking wrapper for scripts that don't want asyncio.

    Uses a dedicated httpx.Client instead of running an event loop.
    Fire-and-forget is implemented with a background thread pool.
    """

    def __init__(self, config: ObsConfig) -> None:
        import concurrent.futures

        self._config = config
        self._client = httpx.Client(timeout=config.timeout_s)
        self._pool = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        self._inflight: list[concurrent.futures.Future[None]] = []

    def _dispatch(self, event: ObsEvent) -> None:
        payload = event.to_payload(self._config.app)
        headers = {"x-api-key": self._config.api_key}
        for attempt in (1, 2):
            try:
                resp = self._client.post(
                    self._config.endpoint, json=payload, headers=headers
                )
                resp.raise_for_status()
                return
            except Exception as err:
                if attempt == 2:
                    log.warning("obs dispatch failed: %s", err)

    def log(self, event: ObsEvent, *, wait: bool = False) -> None:
        fut = self._pool.submit(self._dispatch, event)
        self._inflight.append(fut)
        if wait:
            fut.result()

    def flush(self) -> None:
        for fut in self._inflight:
            try:
                fut.result()
            except Exception:
                pass
        self._inflight.clear()

    def close(self) -> None:
        self.flush()
        self._pool.shutdown(wait=True)
        self._client.close()


def create_obs(config: ObsConfig) -> Obs:
    return Obs(config)


def create_sync_obs(config: ObsConfig) -> SyncObs:
    return SyncObs(config)


__all__ = [
    "ObsConfig",
    "ObsEvent",
    "Obs",
    "SyncObs",
    "create_obs",
    "create_sync_obs",
]
