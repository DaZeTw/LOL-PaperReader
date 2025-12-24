"""
Metadata service to integrate with external Metadata Extraction API.

This service calls the ngrok API for processing PDFs and retrieving Metadata.
Implements caching by paper_id to avoid reprocessing.
"""

import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Literal, Any
import httpx
from fastapi import UploadFile
from pydantic import BaseModel, Field, validator
from typing import List, Optional

# API Configuration
METADATA_API_BASE = "https://unjoking-haematoidin-elizebeth.ngrok-free.dev"

# Dataclass for external API response
class ExternalMetadataData(BaseModel):
    """
    {
            "title": "",
            "authors": [],
            "doi": "",
            "publication_date": "",
            "publisher": "",
            "abstract": "",
            "link": "   ",
            "citation_count": 0,
            "board_topic": [
            ]
        }
"""
    title: Optional[str] = ""
    authors: List[str] = Field(default_factory=list)
    doi: Optional[str] = ""
    publication_date: Optional[str] = ""
    publisher: Optional[str] = ""
    abstract: Optional[str] = ""
    link: Optional[str] = ""
    citation_count: Optional[int] = 0
    board_topic: List[str] = Field(default_factory=list)

    @validator('authors', pre=True)
    def ensure_list(cls, v):
        return v if isinstance(v, list) else []
    
    @validator('board_topic', pre=True)
    def ensure_list(cls, v):
        return v if isinstance(v, list) else []

class ExternalAPIResponse(BaseModel):
    success: bool
    data: Optional[ExternalMetadataData] = None


def _metadata_res_to_internal_schema_mapper(
    metadata_res: Dict
):
    """
    Convert metadata response from external API to internal schema.

    Currently in mongodb, metadata is stored together with document. Only the following fields are stored:
        +, source (publisher), 
        +, author (authors)
        +, subject (field of study)
        +, title (title)
    
    The metadata response have sample as following:
    {
        "success": true,
        "message": "Extracted successfully",
        "data": {
            "title": "",
            "authors": [],
            "doi": "",
            "publication_date": "",
            "publisher": "",
            "abstract": "",
            "link": "   ",
            "citation_count": 0,
            "board_topic": [
            ]
        },
        "error": null
    }
    So we only extract these fields from the metadata response.
    """
    try:
        # Pydantic validate & parse
        parsed = ExternalAPIResponse(**metadata_res)
        
        if not parsed.success or not parsed.data:
            return {
                "source": "Unknown",
                "author": "",
                "subject": "",
                "title": "Unknown",
                "year": None
            }
            
        data = parsed.data
        year = data.publication_date.split("-")[0] if data.publication_date else None
        return {
            "source": data.publisher or "Unknown",
            "author": ", ".join(data.authors), # Safe because Pydantic ensured list
            "subject": ", ".join(data.board_topic),
            "title": data.title or "Unknown",
            "year": year
        }
    except Exception as e:
        print(f"Validation Error: {e}")
        # Return fallback/default
        return {
            "source": "Unknown",
            "author": "",
            "subject": "",
            "title": "Unknown",
            "year": None
        }
    
async def process_metadata(
    pdf_file: bytes,
    file_name: str
):
    """
    Call /v1/grobid_augmented to get metadata from PDF file.

    Args:
        pdf_file: PDF file bytes
        file_name: Name of the PDF file (only for logging purposes)

    Returns:
        Response from API
    """
    url = f"{METADATA_API_BASE}/v1/grobid_augmented"

    print(f"[MetadataService] Processing paper: {file_name}")

    async with httpx.AsyncClient(timeout=20.0) as client:
        files = {
            "file": (file_name, pdf_file, "application/pdf")
        }

        try:
            response = await client.post(url, files=files)
            
            if response.status_code != 200:
                print(f"[MetadataService] ❌ API Error {response.status_code}: {response.text}")

            response.raise_for_status()
            result = response.json()
            print(f"[MetadataService] Paper processed successfully: {file_name}")
            return _metadata_res_to_internal_schema_mapper(result)
        except httpx.HTTPError as e:
            print(f"[MetadataService] Error processing paper: {e}")
            raise

# save metadata to mongodb
from paperreader.database.mongodb import mongodb
from bson import ObjectId
from datetime import datetime

async def save_metadata(document_id: str, metadata: Dict[str, Any]):
    collection = mongodb.get_collection("documents") 
    
    # Convert document_id to ObjectId
    try:
        doc_object_id = ObjectId(document_id)
    except Exception:
        raise ValueError(f"Invalid document_id: {document_id}")

    now = datetime.utcnow()
    
    # Check if document exists using _id
    existing = await collection.find_one({"_id": doc_object_id})
    
    if existing:
        # Update the source, author, subject, title fields of the document
        await collection.update_one(
            {"_id": doc_object_id},
            {
                "$set": {
                    "source": metadata.get("source"),
                    "author": metadata.get("author"),
                    "subject": metadata.get("subject"),
                    "title": metadata.get("title"),
                    "updated_at": now
                }
            }
        )
        print(f"[MetadataService] Updated source, author, subject, title for document_id={document_id}")
        return str(existing["_id"])
    else:
        # raise error
        raise ValueError(f"Document {document_id} not found")

        