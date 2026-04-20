FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder
COPY pyproject.toml ./
RUN pip install --prefix=/install .

FROM base AS runtime
COPY --from=builder /install /usr/local
COPY app ./app
COPY prompts /prompts
COPY "기간별 순위 취합.xlsx" /data/ranking.xlsx

ENV RANKING_XLSX_PATH=/data/ranking.xlsx \
    PROMPTS_DIR=/prompts \
    PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
