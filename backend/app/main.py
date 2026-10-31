import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import admin, auth, bathymetry, health, imagery, offline, providers
from app.api.v1.routes import map as map_routes
from app.core import storage
from app.core.config import get_settings
from app.core.redis import close_redis
from app.db.session import dispose_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await asyncio.to_thread(storage.ensure_bucket)
    except Exception:  # noqa: BLE001 - readiness reports storage problems
        logging.getLogger(__name__).warning("object storage unavailable at startup", exc_info=True)
    yield
    await dispose_engine()
    await close_redis()
    await map_routes.close_tile_client()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="JigMap Maldives: marine navigation and fishing intelligence API.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    v1 = APIRouter(prefix=settings.api_v1_prefix)
    v1.include_router(health.router)
    v1.include_router(auth.router)
    v1.include_router(map_routes.router)
    v1.include_router(bathymetry.router)
    v1.include_router(imagery.router)
    v1.include_router(offline.router)
    v1.include_router(providers.router)
    v1.include_router(admin.router)
    app.include_router(v1)
    return app


app = create_app()
