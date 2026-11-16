FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgdal-dev \
    libgeos-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Build the road graph into the image so the API never downloads it at
# startup. Only the files this step needs are copied first, so Docker reuses
# the cached graph layer unless graph.py or the build script change.
COPY app/__init__.py app/__init__.py
COPY app/services/__init__.py app/services/__init__.py
COPY app/services/graph.py app/services/graph.py
COPY scripts/build_graph.py scripts/build_graph.py
RUN python -m scripts.build_graph

COPY . .

EXPOSE 8000

# Railway injects $PORT at runtime; fall back to 8000 for local docker runs.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
