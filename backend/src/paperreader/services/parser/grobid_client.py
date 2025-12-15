import os
from pathlib import Path
from typing import Optional

import requests


class GrobidClient:
    """Client for interacting with GROBID service."""

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize GROBID client.

        Args:
            base_url: GROBID server URL (default: http://localhost:8070)
        """
        self.base_url = base_url or os.getenv("GROBID_URL", "http://localhost:8070")
        self.api_url = f"{self.base_url}/api/processFulltextDocument"

    def process_pdf(self, pdf_path: Path, include_coords: bool = True) -> str:
        """
        Process PDF with GROBID to extract structured content.

        Args:
            pdf_path: Path to PDF file
            include_coords: Whether to include bounding box coordinates

        Returns:
            TEI XML string

        Raises:
            RuntimeError: If GROBID processing fails
        """
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        with open(pdf_path, "rb") as pdf_file:
            data = {}
            if include_coords:
                data["teiCoordinates"] = ["biblStruct", "ref"]

            response = requests.post(
                self.api_url,
                files={"input": pdf_file},
                data=data,
                timeout=300,  # 5 minutes timeout for large PDFs
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"GROBID processing failed with status {response.status_code}: {response.text}"
            )

        return response.text
