/**
 * Fetches metadata for a given PDF file from the external service.
 * @param fileBlob - The PDF file binary data.
 * @returns The parsed metadata including authors and DOI.
 * metadata endpoint used:
 *  +, API endpoint: POST https://unjoking-haematoidin-elizebeth.ngrok-free.dev/v1/grobid_augmented
 *  curl -X 'POST' \
  'https://unjoking-haematoidin-elizebeth.ngrok-free.dev/v1/grobid_augmented' \
  -H 'accept: application/json' \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@2305.19118v4.pdf;type=application/pdf'
 * +, return result:
    {
        "status" "success",
        "metadata":{
            "title": "Title",
            "authors": [
                "author1",
                "author2"
            ],
            "doi": "doi",
            "publication_date": "publication_date",
            "publisher": "publisher",
            "abstract":"abstract",
            "link": "link",
            "citation_count": "citation_count",
            "board_topic":[
                "topic1",
                "topic2"
            ]
        }
    }
 */
// 

export interface GrobidAugmentedMetadata {
    title: string;
    authors: string[];
    doi?: string;
    publication_date?: string;
    publisher?: string;
    abstract?: string;
    link?: string;
    citation_count?: number;
    board_topic?: string[];
}

export interface GrobidAugmentedResponse {
    status: string;
    metadata: GrobidAugmentedMetadata;
}

export interface ParsedMetadata {
    title: string;
    authors: string[];
    year?: number;
    source?: string;
    doi?: string;
}

const API_ENDPOINT = "https://unjoking-haematoidin-elizebeth.ngrok-free.dev/v1/grobid_augmented";

/**
 * Fetches and parses metadata for a PDF file.
 * @param file - The PDF file object (File or Blob).
 * @returns Standardized metadata for usage in the app.
 */

export async function fetchPdfMetadata(file: File | Blob, apiEndpoint: string = API_ENDPOINT): Promise<ParsedMetadata | null> {
    try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(apiEndpoint, {
            method: "POST",
            headers: {
                "accept": "application/json",
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: GrobidAugmentedResponse = await response.json();

        console.log("[MetadataService] API response:", data);

        if (data.status !== "success") {
            throw new Error(`Invalid response from API: ${data.status}`);
        }

        const metadata = data.metadata;
        const parsedMetadata: ParsedMetadata = {
            title: metadata.title,
            authors: metadata.authors,
            year: metadata.publication_date ? new Date(metadata.publication_date).getFullYear() : undefined,
            source: metadata.publisher,
            doi: metadata.doi,
        };

        return parsedMetadata;
    } catch (error) {
        console.error("[MetadataService] Error fetching metadata:", error);
        return null;
    }
}