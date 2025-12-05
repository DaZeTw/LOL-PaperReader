"""Reference extraction and linking services."""
from .models import Reference
from .reference_parser import parse_references
from .link_generator import generate_link, update_reference_link

__all__ = ["Reference", "parse_references", "generate_link", "update_reference_link"]
