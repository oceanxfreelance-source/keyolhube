from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import auth, health
from app.api.v1.routes import map as map_routes
from app.core.config import get_settings
from app.core.redis import close_redis
from app.db.session import dispose_engine


@asynccontextmanager
async def lifespan(_: FastAPI):
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
    app.include_router(v1)
    return app


app = create_app()
