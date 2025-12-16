from typing import List, Optional
from pathlib import Path
import asyncio

from paperreader.services.parser.grobid_client import GrobidClient
from paperreader.services.parser.reference_extractor import (
    ReferenceExtractorService,
    Reference as ExtractedReference,
)
from paperreader.models.reference import (
    ReferenceSchema,
    ReferenceCreate,
    ReferenceUpdate,
    BoundingBoxSchema,
    CitationMentionSchema,
)
from paperreader.services.references import repository


class ReferenceService:
    """Service for managing document references."""

    def __init__(self):
        self.grobid_client = GrobidClient()

    def _convert_extracted_to_schema(
        self, extracted_ref: ExtractedReference, document_id: str
    ) -> ReferenceCreate:
        """Convert extracted reference to database schema."""
        bib_location = [
            BoundingBoxSchema(
                page=box.page,
                left=box.left,
                top=box.top,
                width=box.width,
                height=box.height,
            )
            for box in extracted_ref.boxes
        ]

        mentions = [
            CitationMentionSchema(
                text=marker.text,
                boxes=[
                    BoundingBoxSchema(
                        page=box.page,
                        left=box.left,
                        top=box.top,
                        width=box.width,
                        height=box.height,
                    )
                    for box in marker.boxes
                ],
            )
            for marker in extracted_ref.citation_contexts
        ]

        return ReferenceCreate(
            document_id=document_id,
            ref_id=extracted_ref.id,
            title=extracted_ref.title,
            venue=extracted_ref.venue,
            authors=extracted_ref.authors,
            year=extracted_ref.year,
            volume=extracted_ref.volume,
            issue=extracted_ref.issue,
            pages=extracted_ref.pages,
            doi=extracted_ref.doi,
            arxiv_id=extracted_ref.arxiv_id,
            bib_location=bib_location,
            mentions=mentions,
        )

    async def extract_and_save_references(
        self, pdf_path: Path, document_id: str
    ) -> List[ReferenceSchema]:
        """Extract references from PDF and save to database."""
        # Step 1: Process PDF with GROBID
        xml_content = await asyncio.to_thread(
            self.grobid_client.process_pdf, pdf_path, include_coords=True
        )

        # Step 2: Extract references from XML
        extractor = ReferenceExtractorService(xml_content)
        extracted_refs = extractor.extract_references()

        # Step 3: Convert to database schema
        reference_creates = [
            self._convert_extracted_to_schema(ref, document_id)
            for ref in extracted_refs
        ]

        # Step 4: Replace existing references
        saved_refs = await repository.replace_document_references(
            document_id, reference_creates
        )

        return saved_refs

    async def get_reference(self, reference_id: str) -> Optional[ReferenceSchema]:
        """Get a single reference by ID."""
        return await repository.get_reference_by_id(reference_id)

    async def get_document_references(
        self, document_id: str, skip: int = 0, limit: int = 100
    ) -> List[ReferenceSchema]:
        """Get all references for a document."""
        return await repository.get_references_by_document(document_id, skip, limit)

    async def update_reference(
        self, reference_id: str, update_data: ReferenceUpdate
    ) -> Optional[ReferenceSchema]:
        """Update a reference."""
        return await repository.update_reference(reference_id, update_data)

    async def delete_reference(self, reference_id: str) -> bool:
        """Delete a reference."""
        return await repository.delete_reference(reference_id)

    async def delete_document_references(self, document_id: str) -> int:
        """Delete all references for a document."""
        return await repository.delete_references_by_document(document_id)

    async def search_references(
        self,
        query: str,
        document_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[ReferenceSchema]:
        """Search references."""
        return await repository.search_references(query, document_id, skip, limit)

    async def get_reference_count(self, document_id: str) -> int:
        """Get reference count for a document."""
        return await repository.count_references_by_document(document_id)
