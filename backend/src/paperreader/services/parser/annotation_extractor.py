from typing import Any, Dict, List

import fitz


class AnnotationExtractorService:
    """Service for extracting reference annotations from PDF files."""

    def __init__(self, line_tolerance: float = 0.008, horizontal_gap: float = 0.05):
        """
        Initialize the service.

        Args:
            line_tolerance: Tolerance for detecting same-line annotations (0.8% of page height)
            horizontal_gap: Maximum horizontal gap to merge annotations (5% of page width)
        """
        self.line_tolerance = line_tolerance
        self.horizontal_gap = horizontal_gap

    def extract(self, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Extract normalized annotations from a PDF file.

        Args:
            pdf_path: Path to the PDF file

        Returns:
            List of page annotations in format:
            [
                {
                    "page": 1,
                    "annotations": [
                        {
                            "dest": "cite.reference1",
                            "source": {"x1": 0.1, "y1": 0.2, "x2": 0.15, "y2": 0.22},
                            "target": {"page": 10, "x": 0.5, "y": 0.8}
                        }
                    ]
                }
            ]
        """
        doc = fitz.open(pdf_path)
        results = []

        try:
            for page_index in range(len(doc)):
                page = doc[page_index]
                page_num = page_index + 1
                page_width = page.rect.width
                page_height = page.rect.height

                links = page.get_links()
                raw_annotations = []

                for link in links:
                    dest_name = link.get("nameddest") or ""

                    if not dest_name.startswith("cite."):
                        continue

                    # Normalize source coordinates
                    s_rect = link["from"]
                    source = {
                        "x1": s_rect.x0 / page_width,
                        "y1": s_rect.y0 / page_height,
                        "x2": s_rect.x1 / page_width,
                        "y2": s_rect.y1 / page_height,
                    }

                    # Resolve target
                    target_info = None
                    target_page_idx = link.get("page")

                    if target_page_idx is not None:
                        target_page = doc[target_page_idx]
                        t_width = target_page.rect.width
                        t_height = target_page.rect.height

                        to_point = link.get("to")
                        if to_point:
                            target_info = {
                                "page": target_page_idx + 1,
                                "x": to_point.x / t_width,
                                "y": to_point.y / t_height,
                            }

                    raw_annotations.append(
                        {"dest": dest_name, "source": source, "target": target_info}
                    )

                if raw_annotations:
                    merged = self._merge_annotations(raw_annotations)
                    results.append({"page": page_num, "annotations": merged})

        finally:
            doc.close()

        return results

    def _merge_annotations(
        self, annotations: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Merge boxes for the same destination if they are on the same line.

        Args:
            annotations: List of raw annotations

        Returns:
            List of merged annotations
        """
        if not annotations:
            return []

        # Group by destination
        groups = {}
        for ann in annotations:
            dest = ann["dest"]
            if dest not in groups:
                groups[dest] = []
            groups[dest].append(ann)

        final_results = []

        for dest, items in groups.items():
            # Sort by Y then X
            items.sort(key=lambda a: (a["source"]["y1"], a["source"]["x1"]))

            current = items[0]
            for i in range(1, len(items)):
                next_ann = items[i]

                same_line = (
                    abs(current["source"]["y1"] - next_ann["source"]["y1"])
                    < self.line_tolerance
                )
                horizontally_near = (
                    next_ann["source"]["x1"] - current["source"]["x2"]
                ) < self.horizontal_gap

                if same_line and horizontally_near:
                    current["source"] = {
                        "x1": min(current["source"]["x1"], next_ann["source"]["x1"]),
                        "y1": min(current["source"]["y1"], next_ann["source"]["y1"]),
                        "x2": max(current["source"]["x2"], next_ann["source"]["x2"]),
                        "y2": max(current["source"]["y2"], next_ann["source"]["y2"]),
                    }
                else:
                    final_results.append(current)
                    current = next_ann
            final_results.append(current)

        return final_results
