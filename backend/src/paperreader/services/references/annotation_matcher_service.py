"""
Service for matching citation annotations with reference metadata.

This service links citation annotations (extracted from PDF links) with
reference metadata (extracted via GROBID) using spatial proximity matching.
"""

import math
from typing import Any, Dict, List, Optional

from paperreader.models.reference import ReferenceSchema


class AnnotationMatcherService:
    """Service for matching annotations with reference metadata."""

    def __init__(self, distance_threshold: float = 0.1):
        """
        Initialize the matcher service.

        Args:
            distance_threshold: Maximum normalized distance for matching (default: 0.1 = 10% of page)
        """
        self.distance_threshold = distance_threshold

    def match_annotations(
        self,
        annotations: List[Dict[str, Any]],
        references: List[ReferenceSchema],
    ) -> List[Dict[str, Any]]:
        """
        Match citation annotations with reference metadata.

        Args:
            annotations: List of page annotations from AnnotationExtractorService
                Format: [{"page": 1, "annotations": [...]}, ...]
            references: List of reference schemas from ReferenceService

        Returns:
            Enriched annotations with matched metadata
            Format: [
                {
                    "page": 1,
                    "annotations": [
                        {
                            "dest": "cite.ref1",
                            "source": {...},
                            "target": {...},
                            "metadata": {
                                "id": "ref_id",
                                "title": "Paper Title",
                                "authors": ["Author 1"],
                                ...
                            }
                        }
                    ]
                }
            ]
        """
        enriched_results = []

        for page_data in annotations:
            updated_annotations = []

            for ann in page_data.get("annotations", []):
                target = ann.get("target")

                # Skip if no target or missing page information
                if not target or target.get("page") is None:
                    updated_annotations.append(ann)
                    continue

                # Find closest matching reference
                matched_ref = self._find_closest_reference(target, references)

                # Attach metadata if match found
                if matched_ref:
                    ann["metadata"] = self._extract_metadata(matched_ref)

                updated_annotations.append(ann)

            enriched_results.append(
                {"page": page_data["page"], "annotations": updated_annotations}
            )

        return enriched_results

    def _find_closest_reference(
        self,
        target: Dict[str, Any],
        references: List[ReferenceSchema],
    ) -> Optional[ReferenceSchema]:
        """
        Find the closest reference to the target location.

        Args:
            target: Target location dict with page, x, y
            references: List of reference schemas

        Returns:
            Closest matching reference or None
        """
        closest_ref = None
        min_distance = float("inf")
        target_page = target["page"]
        target_x = target["x"]
        target_y = 1 - target["y"]

        for ref in references:
            if not ref.bib_location:
                continue

            # Use first bounding box as anchor point
            first_box = ref.bib_location[0]

            # Match by page number first
            if first_box.page == target_page:
                # Calculate Euclidean distance
                distance = self._calculate_distance(
                    target_x, target_y, first_box.left, first_box.top
                )

                if distance < min_distance:
                    min_distance = distance
                    closest_ref = ref

        # Only return if within threshold
        if closest_ref and min_distance < self.distance_threshold:
            return closest_ref

        return None

    @staticmethod
    def _calculate_distance(x1: float, y1: float, x2: float, y2: float) -> float:
        """
        Calculate Euclidean distance between two points.

        Args:
            x1, y1: First point coordinates
            x2, y2: Second point coordinates

        Returns:
            Euclidean distance
        """
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    @staticmethod
    def _extract_metadata(reference: ReferenceSchema) -> Dict[str, Any]:
        """
        Extract relevant metadata from reference schema.

        Args:
            reference: Reference schema object

        Returns:
            Dictionary with metadata fields
        """
        metadata = {
            "id": reference.id,
            "ref_id": reference.ref_id,
            "title": reference.title,
            "authors": reference.authors,
            "year": reference.year,
            "venue": reference.venue,
        }

        # Add optional fields if present
        if reference.doi:
            metadata["doi"] = reference.doi
        if reference.arxiv_id:
            metadata["arxiv_id"] = reference.arxiv_id
        if reference.bib_location:
            metadata["bib_box"] = {
                "page": reference.bib_location[0].page,
                "left": reference.bib_location[0].left,
                "top": reference.bib_location[0].top,
                "width": reference.bib_location[0].width,
                "height": reference.bib_location[0].height,
            }

        return metadata
