"""Download the OSM walk network and save it to data/graph.pkl.

Runs during the Docker build so the deployed API never downloads the graph
at startup (which made cold starts take 30 s or more).

Usage (from backend/ directory):
    python -m scripts.build_graph
"""
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.graph import CACHE_PATH, download_graph, save_graph

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def main() -> None:
    g = download_graph()
    save_graph(g)
    size_mb = CACHE_PATH.stat().st_size / 1e6
    logging.info("Saved %s (%d nodes, %d edges, %.1f MB)", CACHE_PATH, len(g.nodes), len(g.edges), size_mb)


if __name__ == "__main__":
    main()
