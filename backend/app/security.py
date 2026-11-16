"""Request hardening for a small public API with no accounts.

- Request bodies are capped (the only body the API accepts is a ~60 byte route request).
- Every response carries basic security headers.
- Route computation, the only CPU-heavy endpoint, is rate limited per client
  and capped in concurrency, so one client can't monopolize the single vCPU.
"""
import asyncio
import time
from typing import Dict, Tuple

from fastapi import HTTPException, Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = 4 * 1024

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"strict-transport-security", b"max-age=31536000"),
]


class SecurityMiddleware:
    """Pure ASGI middleware: rejects oversized bodies and adds security headers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                message["headers"] = list(message["headers"]) + SECURITY_HEADERS
            await send(message)

        if scope["method"] in ("POST", "PUT", "PATCH"):
            headers = dict(scope.get("headers") or [])
            declared = headers.get(b"content-length")
            if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
                await _reject_too_large(send_with_headers)
                return

            # Read the (small) body up front, enforcing the cap even when the
            # client sends no Content-Length (chunked encoding), then replay it.
            chunks, size = [], 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > MAX_BODY_BYTES:
                    await _reject_too_large(send_with_headers)
                    return
                chunks.append(chunk)
                if not message.get("more_body", False):
                    break
            body = b"".join(chunks)
            replayed = False

            async def replay() -> Message:
                nonlocal replayed
                if not replayed:
                    replayed = True
                    return {"type": "http.request", "body": body, "more_body": False}
                return await receive()

            await self.app(scope, replay, send_with_headers)
            return

        await self.app(scope, receive, send_with_headers)


async def _reject_too_large(send: Send) -> None:
    payload = b'{"detail":"Request body too large"}'
    await send({
        "type": "http.response.start",
        "status": 413,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())],
    })
    await send({"type": "http.response.body", "body": payload})


def client_ip(request: Request) -> str:
    """The visitor's IP. Railway's edge sets X-Real-IP and overwrites any copy a
    client sends; locally (no edge) fall back to the socket address."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


class RateLimiter:
    """Token bucket per client: `burst` requests at once, refilled at `per_minute`.

    In memory on purpose: the API runs as a single instance, and losing the
    counters when it sleeps or restarts is harmless.
    """

    def __init__(self, per_minute: float, burst: int, max_clients: int = 10_000) -> None:
        self.rate = per_minute / 60.0
        self.burst = float(burst)
        self.max_clients = max_clients
        self._buckets: Dict[str, Tuple[float, float]] = {}  # ip -> (tokens, last_seen)

    def check(self, key: str) -> float:
        """Take one token. Returns 0 if allowed, else seconds until the next token."""
        now = time.monotonic()
        tokens, last = self._buckets.get(key, (self.burst, now))
        tokens = min(self.burst, tokens + (now - last) * self.rate)
        if tokens >= 1:
            self._buckets[key] = (tokens - 1, now)
            self._prune(now)
            return 0.0
        self._buckets[key] = (tokens, now)
        return (1 - tokens) / self.rate

    def _prune(self, now: float) -> None:
        # Drop clients whose bucket has refilled; bounds memory under IP spraying.
        if len(self._buckets) <= self.max_clients:
            return
        full_after = self.burst / self.rate
        self._buckets = {k: v for k, v in self._buckets.items() if now - v[1] < full_after}
        if len(self._buckets) > self.max_clients:
            self._buckets.clear()


# A person planning a walk makes a handful of route requests a minute.
route_limiter = RateLimiter(per_minute=30, burst=10)

# One vCPU: more parallel A* searches would only slow each other down.
MAX_CONCURRENT_ROUTES = 2
ROUTE_QUEUE_TIMEOUT_S = 10
_route_slots = asyncio.Semaphore(MAX_CONCURRENT_ROUTES)


def enforce_route_rate_limit(request: Request) -> None:
    wait = route_limiter.check(client_ip(request))
    if wait:
        raise HTTPException(
            status_code=429,
            detail="Too many route requests. Please wait a few seconds and try again.",
            headers={"Retry-After": str(max(1, round(wait)))},
        )


class route_slot:
    """`async with route_slot():` waits briefly for a free routing slot, else 503."""

    async def __aenter__(self) -> None:
        try:
            await asyncio.wait_for(_route_slots.acquire(), timeout=ROUTE_QUEUE_TIMEOUT_S)
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=503,
                detail="The routing server is busy. Please try again in a moment.",
                headers={"Retry-After": "5"},
            )

    async def __aexit__(self, *exc) -> None:
        _route_slots.release()
