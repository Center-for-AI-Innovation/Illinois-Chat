# Build context is apps/backend (not this directory) so the image can see pyproject.toml and uv.lock.
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.12.8 /uv /uvx /bin/

# ffmpeg: pydub and subprocess calls in ingest.py. tesseract: pytesseract OCR. git: GitPython.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tesseract-ocr git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Fail loudly if the base image's interpreter does not satisfy .python-version instead of downloading one.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0

# Dependency layer: only invalidated when the manifest or lock changes.
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra worker
ENV PATH="/app/.venv/bin:$PATH"

# Pre-download NLTK data so unstructured (Excel, PPTX, etc.) does not fetch at runtime (403 in many environments).
ENV NLTK_DATA=/usr/share/nltk_data
RUN mkdir -p "$NLTK_DATA" && chmod -R 755 "$NLTK_DATA" \
    && python -m nltk.downloader -d "$NLTK_DATA" punkt_tab averaged_perceptron_tagger_eng

COPY ai_ta_backend ./ai_ta_backend

EXPOSE 8001

# Running worker.py by path puts ai_ta_backend/rabbitmq on sys.path, which its bare imports need.
CMD ["python", "ai_ta_backend/rabbitmq/worker.py"]
