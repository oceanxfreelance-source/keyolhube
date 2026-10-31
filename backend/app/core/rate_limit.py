"""Fixed-window rate limiting backed by Redis.

If Redis is unavailable the limiter fails open (and logs) so that an outage of the
cache does not lock every user out; /health/ready reports Redis as down.
"""

import logging
import time

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from app.core.redis import get_redis

log = logging.getLogger(__name__)


def rate_limit(name: str, limit: int, window_seconds: int):
    async def _dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        window = int(time.time() // window_seconds)
        key = f"rl:{name}:{client_ip}:{window}"
        try:
            redis = get_redis()
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, window_seconds)
        except RedisError:
            log.warning("rate limiter unavailable; allowing request", exc_info=True)
            return
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, try again later",
                headers={"Retry-After": str(window_seconds)},
            )

    return _dependency
