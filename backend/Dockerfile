FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Every dependency ships as a prebuilt wheel, so no compilers or system
# libraries are installed (smaller image, fewer packages to patch).
COPY requirements.txt .
RUN pip install --only-binary=:all: -r requirements.txt

# Build the road graph into the image so the API never downloads it at
# startup. Only the files this step needs are copied first, so Docker reuses
# the cached graph layer unless graph.py or the build script change.
COPY app/__init__.py app/__init__.py
COPY app/services/__init__.py app/services/__init__.py
COPY app/services/graph.py app/services/graph.py
COPY scripts/build_graph.py scripts/build_graph.py
RUN python -m scripts.build_graph

COPY . .

# Run as an unprivileged user: a bug in the app can't modify the image or
# install anything. The baked graph stays readable.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER app

EXPOSE 8000

# Railway injects $PORT at runtime; fall back to 8000 for local docker runs.
# --no-server-header hides the server software; --limit-concurrency caps open
# connections so a flood gets fast 503s instead of exhausting memory.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header --limit-concurrency 100"]
