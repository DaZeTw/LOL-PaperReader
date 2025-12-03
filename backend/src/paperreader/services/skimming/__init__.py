"""Skimming service for external highlighting API integration."""

from .skimming_service import (
    process_paper_v2,
    get_highlights,
    process_and_highlight,
    get_preset_params,
    PresetType,
)

__all__ = [
    "process_paper_v2",
    "get_highlights",
    "process_and_highlight",
    "get_preset_params",
    "PresetType",
]
