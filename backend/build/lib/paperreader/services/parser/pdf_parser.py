import os
from pathlib import Path

# 🔧 Fix Docling path issue on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"

import docling_parse
resource_dir = Path(docling_parse.__file__).parent / "pdf_resources_v2"
os.environ["DOCLING_PARSE_RESOURCES"] = str(resource_dir)


import logging
import time
import pandas as pd
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling_core.types.doc import ImageRefMode, PictureItem, TableItem


_log = logging.getLogger(__name__)


def parse_pdf_with_docling(input_pdf_path: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- Configure pipeline
    pipeline_options = PdfPipelineOptions()
    pipeline_options.images_scale = 2.0
    pipeline_options.generate_page_images = True
    pipeline_options.generate_picture_images = True
    pipeline_options.do_formula_enrichment = True

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    start_time = time.time()
    result = converter.convert(input_pdf_path)
    doc = result.document
    pdf_stem = input_pdf_path.stem

    outputs = {
        "page_images": [],
        "figures": [],
        "tables_csv": [],
        "tables_html": [],
        "markdown_embedded": None,
        "markdown_referenced": None,
        "html": None,
    }

    # --- Export Page Images ---
    for page_no, page in doc.pages.items():
        page_img_path = output_dir / f"{pdf_stem}-page-{page_no}.png"
        page.image.pil_image.save(page_img_path, format="PNG")
        outputs["page_images"].append(str(page_img_path))

    # --- Export Figures ---
    for i, (element, _) in enumerate(doc.iterate_items()):
        if isinstance(element, PictureItem):
            fig_path = output_dir / f"{pdf_stem}-figure-{i+1}.png"
            element.get_image(doc).save(fig_path, "PNG")
            outputs["figures"].append(str(fig_path))

    # --- Export Tables (CSV + HTML) ---
    for i, table in enumerate(doc.tables):
        df: pd.DataFrame = table.export_to_dataframe()

        csv_path = output_dir / f"{pdf_stem}-table-{i+1}.csv"
        df.to_csv(csv_path, index=False)
        outputs["tables_csv"].append(str(csv_path))

        html_path = output_dir / f"{pdf_stem}-table-{i+1}.html"
        with html_path.open("w", encoding="utf-8") as f:
            f.write(table.export_to_html(doc=doc))
        outputs["tables_html"].append(str(html_path))

    # --- Export Markdown ---
    md_embed = output_dir / f"{pdf_stem}-embedded.md"
    doc.save_as_markdown(md_embed, image_mode=ImageRefMode.EMBEDDED)
    outputs["markdown_embedded"] = str(md_embed)

    md_ref = output_dir / f"{pdf_stem}-referenced.md"
    doc.save_as_markdown(md_ref, image_mode=ImageRefMode.REFERENCED)
    outputs["markdown_referenced"] = str(md_ref)

    # --- Export HTML ---
    html_file = output_dir / f"{pdf_stem}-referenced.html"
    doc.save_as_html(html_file, image_mode=ImageRefMode.REFERENCED)
    outputs["html"] = str(html_file)

    elapsed = time.time() - start_time
    _log.info(f"Docling parsing completed in {elapsed:.2f} seconds")

    return outputs
