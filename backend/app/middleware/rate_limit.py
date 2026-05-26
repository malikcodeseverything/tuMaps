import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


@dataclass(frozen=True)
class LimitRule:
    key: str
    requests_per_minute: int


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Small in-memory rate limiter for the public MVP API.

    Railway currently runs a single replica, so process-local counters are
    enough. If the backend scales horizontally, move this to Redis.
    """

    def __init__(
        self,
        app,
        *,
        enabled: bool,
        route_requests_per_minute: int,
        read_requests_per_minute: int,
    ):
        super().__init__(app)
        self.enabled = enabled
        self.route_rule = LimitRule("routes", route_requests_per_minute)
        self.read_rule = LimitRule("read", read_requests_per_minute)
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        rule = self._rule_for_path(request.url.path)
        if not self.enabled or rule is None:
            return await call_next(request)

        now = time.monotonic()
        client_ip = self._client_ip(request)
        key = (rule.key, client_ip)
        hits = self._hits[key]

        while hits and now - hits[0] >= 60:
            hits.popleft()

        if len(hits) >= rule.requests_per_minute:
            retry_after = max(1, int(60 - (now - hits[0]))) if hits else 60
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again shortly."},
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rule.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(max(rule.requests_per_minute - len(hits), 0))
        return response

    def _rule_for_path(self, path: str) -> LimitRule | None:
        if path == "/api/routes":
            return self.route_rule
        if path in {"/api/incidents", "/api/segments/risk"}:
            return self.read_rule
        return None

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",", 1)[0].strip()
        return request.client.host if request.client else "unknown"
