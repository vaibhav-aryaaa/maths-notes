"""Utility functions for folders and canvases processing."""

import logging

logger = logging.getLogger(__name__)


def sanitize_name(name: str) -> str:
    """Strip leading/trailing whitespace and sanitize name."""
    if not name:
        return ""
    return name.strip()
