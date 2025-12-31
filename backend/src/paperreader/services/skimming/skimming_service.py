"""
Skimming service to integrate with external highlighting API.

This service calls the ngrok API for processing PDFs and retrieving highlights.
Implements caching by paper_id to avoid reprocessing.
"""

import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Literal
import httpx
from fastapi import UploadFile


# API Configuration
SKIMMING_API_BASE = "https://lea-protrudent-azimuthally.ngrok-free.dev"

# Preset configurations for alpha/ratio
PRESETS = {
    "light": {"alpha": 0.3, "ratio": 0.3},
    "medium": {"alpha": 0.5, "ratio": 0.5},
    "heavy": {"alpha": 0.7, "ratio": 0.7},
}

PresetType = Literal["light", "medium", "heavy"]


class SkimmingCache:
    """Simple filesystem cache for skimming results."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        print(f"[SkimmingCache] Initialized with cache directory: {cache_dir}")

    def _get_cache_key(self, file_name: str, mode: str = "dense", alpha: float = 0.5, ratio: float = 0.5) -> str:
        """Generate cache key from file name and parameters."""
        # Use file_name + mode + alpha + ratio as cache key
        key_str = f"{file_name}_{mode}_{alpha}_{ratio}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def get(self, file_name: str, mode: str = "dense", alpha: float = 0.5, ratio: float = 0.5) -> Optional[Dict]:
        """Get cached highlights if available."""
        cache_key = self._get_cache_key(file_name, mode, alpha, ratio)
        cache_file = self.cache_dir / f"{cache_key}.json"

        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                print(f"[SkimmingCache] Cache HIT for {file_name} (mode={mode}, alpha={alpha}, ratio={ratio})")
                return data
            except Exception as e:
                print(f"[SkimmingCache] Error reading cache: {e}")
                return None

        print(f"[SkimmingCache] Cache MISS for {file_name} (mode={mode}, alpha={alpha}, ratio={ratio})")
        return None

    def set(self, file_name: str, data: Dict, mode: str = "dense", alpha: float = 0.5, ratio: float = 0.5):
        """Save highlights to cache."""
        cache_key = self._get_cache_key(file_name, mode, alpha, ratio)
        cache_file = self.cache_dir / f"{cache_key}.json"

        try:
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[SkimmingCache] Saved to cache: {cache_file}")
        except Exception as e:
            print(f"[SkimmingCache] Error writing cache: {e}")


# Global cache instance
_cache: Optional[SkimmingCache] = None


def get_cache(cache_dir: Path) -> SkimmingCache:
    """Get or create cache instance."""
    global _cache
    if _cache is None:
        _cache = SkimmingCache(cache_dir)
    return _cache

# New api for processing paper
async def process_paper_v2(file_name: str, pdf_file: bytes, used_cache: bool = False) -> Dict:
    """
    Call /process_paperv2 to preprocess a paper.
    Now this entry for file submitting only, after this function is called, the pdf will be enqueued for processing.
    For processing progress, please use /jobs/{job_id}

    Args:
        file_name: Name of the PDF file (stem only)
        pdf_file: PDF file bytes
        used_cache: If true, use cached result if available

    Returns:
        {
            "status": "queued",
            "job_id": job_id,
            "message": "Job submitted successfully. Poll /jobs/{job_id} for status."
        }
    """
    url = f"{SKIMMING_API_BASE}/process_paperv2"

    print(f"[SkimmingService] Processing paper: {file_name} (used_cache={used_cache})")

    # Headers to bypass ngrok browser warning
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LOL-PaperReader/1.0"
    }

    async with httpx.AsyncClient(timeout=300.0) as client:
        # API expects field name "file" and filename with .pdf extension
        files = {
            "file": (file_name + ".pdf", pdf_file, "application/pdf")
        }
        data = {
            "file_name": file_name,
            "used_cache": str(used_cache).lower()
        }

        try:
            response = await client.post(url, files=files, data=data, headers=headers)
            response.raise_for_status()
            result = response.json()
            job_id = result.get("job_id")
            print(f"[SkimmingService] Paper processing enqueued: {file_name}, job_id: {job_id}")
            return result
        except httpx.HTTPStatusError as e:
            print(f"[SkimmingService] HTTP Status Error processing paper: {e}")
            print(f"[SkimmingService] Response status: {e.response.status_code}")
            try:
                print(f"[SkimmingService] Response body: {e.response.text[:500]}")
            except:
                pass
            raise
        except httpx.HTTPError as e:
            print(f"[SkimmingService] HTTP Error processing paper: {e}")
            raise
        except Exception as e:
            print(f"[SkimmingService] Unexpected error processing paper: {type(e).__name__}: {e}")
            raise

# New api for tracking the state of a job
"""
GET /jobs/{job_id}
this endpoint return the status of a job

the only input is job_id of the file
on success:
{
  "job_id": "<job_id>",
  "status": "pending/running/completed/cancelled",
  "created_at": "<created_at>",
  "file_name": "<file_name>",
  "message": "<message>"
}

pending mean the pdf is enqueued but not started processing
running mean the pdf is being processed
completed mean the pdf is processed successfully and highlights are ready
cancelled mean the pdf is cancelled by user
"""
async def get_job_status(job_id: str) -> Dict:
    """
    Call /jobs/{job_id} to retrieve the status of a job.

    Args:
        job_id: ID of the job

    Returns:
        Job status JSON data
    """
    url = f"{SKIMMING_API_BASE}/jobs/{job_id}"

    print(f"[SkimmingService] Getting job status: {job_id}")

    # Headers to bypass ngrok browser warning
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LOL-PaperReader/1.0"
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            result = response.json()
            status = result.get("status")
            print(f"[SkimmingService] Got status for job {job_id}: {status}")
            return result
        except httpx.HTTPStatusError as e:
            print(f"[SkimmingService] HTTP Status Error getting job status: {e}")
            print(f"[SkimmingService] Response status: {e.response.status_code}")
            try:
                print(f"[SkimmingService] Response body: {e.response.text[:500]}")
            except:
                pass
            raise
        except httpx.HTTPError as e:
            print(f"[SkimmingService] HTTP Error getting job status: {e}")
            raise
        except Exception as e:
            print(f"[SkimmingService] Unexpected error getting job status: {type(e).__name__}: {e}")
            raise

async def get_highlights(
    job_id: str,
    alpha: float = 0.5,
    ratio: float = 0.5,
) -> Dict:
    """
    Call /get_highlight to retrieve highlights for a processed paper.

    Args:
        job_id: hash returned from /process_paperv2
        alpha: Alpha parameter (for sparse mode)
        ratio: Ratio parameter (for sparse mode)

    Returns:
        {
           "status": "success",
           "result":{
                "file_id": "<file_id>",
                "highlights": [
                    {
                        "id": "<id>",
                        "text": "This is a highlight",
                        "section": "<section>",
                        "label": "<label>",
                        "score": "<score>",
                        "boxes": [
                            {
                                "left": "<left>",
                                "top": "<top>",
                                "width": "<width>",
                                "height": "<height>",
                                "page": "<page>"
                            }
                        ]
                    }
                ],
                "block_id": <block_id>,
                "is_sparse": <boolean>
           }
        }
    """

    url = f"{SKIMMING_API_BASE}/get_highlight"

    print(f"[SkimmingService] Getting highlights: {job_id} (alpha={alpha}, ratio={ratio})")

    # Headers to bypass ngrok browser warning
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LOL-PaperReader/1.0"
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        params = {
            "job_id": job_id,
            "alpha": alpha,
            "ratio": ratio
        }

        try:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            result = response.json()
            
            # Check status of the response
            if result.get("status") == "error":
                message = result.get("message", "Unknown error")
                print(f"[SkimmingService] API returned error for job {job_id}: {message}")
                return {"highlights": [], "status": "error", "message": message}

            # The API returns structure: {"status": "success", "result": {...}}
            inner_result = result.get("result", {})
            highlights = inner_result.get("highlights", [])
            print(f"[SkimmingService] Got {len(highlights)} highlights for job {job_id}")

            return inner_result
        except httpx.HTTPStatusError as e:
            print(f"[SkimmingService] HTTP Status Error: {e}")
            print(f"[SkimmingService] Response status: {e.response.status_code}")
            try:
                print(f"[SkimmingService] Response body: {e.response.text[:500]}")
            except:
                pass
            raise
        except httpx.HTTPError as e:
            print(f"[SkimmingService] HTTP Error: {e}")
            raise

async def cancel_job(job_id: str) -> Dict:
    """
    Call /jobs/{job_id}/cancel to cancel a job.
    POST /jobs/{job_id}/cancel

    Args:
        job_id: ID of the job to cancel
        
    Returns:
        JSON response from API
    """
    url = f"{SKIMMING_API_BASE}/jobs/{job_id}/cancel"
    
    print(f"[SkimmingService] Cancelling job: {job_id}")
    
    # Headers to bypass ngrok browser warning
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LOL-PaperReader/1.0"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, headers=headers)
            response.raise_for_status()
            result = response.json()
            print(f"[SkimmingService] Job {job_id} cancelled: {result.get('message')}")
            return result
        except httpx.HTTPStatusError as e:
            print(f"[SkimmingService] HTTP Status Error cancelling job: {e}")
            print(f"[SkimmingService] Response status: {e.response.status_code}")
            try:
                print(f"[SkimmingService] Response body: {e.response.text[:500]}")
            except:
                pass
            raise
        except httpx.HTTPError as e:
            print(f"[SkimmingService] HTTP Error cancelling job: {e}")
            raise
        except Exception as e:
            print(f"[SkimmingService] Unexpected error cancelling job: {type(e).__name__}: {e}")
            raise


async def process_and_highlight(
    file_name: str,
    pdf_file: bytes,
    alpha: float = 0.5,
    ratio: float = 0.5,
    cache_dir: Optional[Path] = None
) -> Dict:
    """
    Call /process_and_highlight to process a paper and get highlights in one call.

    Args:
        file_name: Name of the PDF file (stem only, no extension)
        pdf_file: PDF file bytes
        alpha: Alpha parameter
        ratio: Ratio parameter
        cache_dir: Directory for caching results (deprecated - not used, only MongoDB is used)

    Returns:
        Highlight JSON data
    """

    url = f"{SKIMMING_API_BASE}/process_and_highlight"

    print(f"[SkimmingService] Processing and highlighting: {file_name} (alpha={alpha}, ratio={ratio})")
    print(f"[SkimmingService] URL: {url}")
    print(f"[SkimmingService] PDF size: {len(pdf_file)} bytes")

    # Headers to bypass ngrok browser warning
    headers = {
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "LOL-PaperReader/1.0"
    }

    async with httpx.AsyncClient(timeout=300.0) as client:
        # IMPORTANT: API expects field name "file" (not "pdf_file") - matches Swagger
        files = {
            "file": (file_name + ".pdf", pdf_file, "application/pdf")
        }
        data = {
            "file_name": file_name,
            "alpha": alpha,
            "ratio": ratio
        }

        try:
            print(f"[SkimmingService] Sending POST request to {url}")
            print(f"[SkimmingService] Form data: file_name={file_name}, alpha={alpha}, ratio={ratio}")
            response = await client.post(url, files=files, data=data, headers=headers)
            print(f"[SkimmingService] Response status: {response.status_code}")
            response.raise_for_status()
            result = response.json()

            # Extract highlights from the nested structure
            if "highlight_result" in result and "highlights" in result["highlight_result"]:
                highlights = result["highlight_result"]["highlights"]
                print(f"[SkimmingService] ✓ Got {len(highlights)} highlights for {file_name}")

                # Create return structure matching expected format
                return_data = {
                    "highlights": highlights,
                    "status": "success"
                }

                return return_data
            else:
                print(f"[SkimmingService] Unexpected response structure: {result.keys()}")
                return {"highlights": [], "status": "error"}

        except httpx.HTTPStatusError as e:
            print(f"[SkimmingService] HTTP Status Error: {e}")
            print(f"[SkimmingService] Response status: {e.response.status_code}")
            print(f"[SkimmingService] Response headers: {dict(e.response.headers)}")
            try:
                print(f"[SkimmingService] Response body: {e.response.text[:1000]}")
            except:
                pass
            raise
        except httpx.HTTPError as e:
            print(f"[SkimmingService] HTTP Error: {e}")
            raise
        except Exception as e:
            print(f"[SkimmingService] Unexpected error: {type(e).__name__}: {e}")
            raise


def get_preset_params(preset: PresetType) -> Dict[str, float]:
    """Get alpha and ratio parameters for a preset."""
    return PRESETS[preset]
