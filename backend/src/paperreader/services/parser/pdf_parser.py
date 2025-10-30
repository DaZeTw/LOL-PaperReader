"""
PDF Parser - Main entry point

Đã chuyển sang sử dụng PyMuPDF (lightweight) thay vì docling
để tránh Docker image lớn và dependency conflicts.
"""

# Import từ pymupdf parser
from .pdf_parser_pymupdf import parse_pdf_with_pymupdf

__all__ = ['parse_pdf_with_pymupdf']
