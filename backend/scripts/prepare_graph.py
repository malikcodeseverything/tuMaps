"""Build the OSM walk graph during Docker image creation."""
import logging

from app.services.graph import load_or_download

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


if __name__ == "__main__":
    load_or_download()
