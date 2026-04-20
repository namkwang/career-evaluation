from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("career_evaluation")
logger.setLevel(logging.DEBUG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    from app.core import prompts, ranking

    try:
        ranking.load(settings.ranking_xlsx_path)
        logger.info("ranking xlsx loaded: %s", settings.ranking_xlsx_path)
    except FileNotFoundError:
        logger.warning("ranking xlsx not found at %s; rankings disabled", settings.ranking_xlsx_path)

    try:
        prompts.load_all(settings.prompts_dir)
        logger.info("prompts loaded from %s", settings.prompts_dir)
    except FileNotFoundError:
        logger.warning("prompts dir not found at %s; prompts disabled", settings.prompts_dir)

    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="career-evaluation backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.routers import (
        admin,
        calculate,
        commentary,
        companies,
        employment,
        extract,
        feedback,
        history,
        merge,
    )

    app.include_router(companies.router)
    app.include_router(calculate.router)
    app.include_router(employment.router)
    app.include_router(admin.router)
    app.include_router(extract.router)
    app.include_router(feedback.router)
    app.include_router(history.router)
    app.include_router(merge.router)
    app.include_router(commentary.router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
