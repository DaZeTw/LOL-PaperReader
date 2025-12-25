"use client"

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react"
import type { ChangeEvent, DragEvent, ForwardedRef, MouseEvent } from "react"
import { Upload, FileText, Loader2, BookOpen, Trash2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { BACKEND_API_URL } from "@/lib/config"
import { useAuth } from "@/hooks/useAuth"

interface PDFUploadProps {
  onFileSelect: (file: File, parsedData?: any) => void
  onParseComplete?: (fileName: string, parsedData: any, fileSize?: number, fileLastModified?: number) => void
}

export interface UploadedDocument {
  _id: string
  workspace_id?: string
  title?: string
  original_filename: string
  stored_path: string
  pdf_hash?: string
  status: string
  num_pages?: number
  total_pages?: number
  author?: string
  subject?: string
  keywords?: string[]
  file_size?: number
  downloadUrl?: string
  fileUrl?: string
  metadataUrl?: string
}

export interface PDFUploadRef {
  triggerFilePicker: () => void
}

const DOCUMENTS_API_BASE = `${BACKEND_API_URL.replace(/\/$/, "")}/api/documents`

export const PDFUpload = forwardRef<PDFUploadRef, PDFUploadProps>(
  ({ onFileSelect, onParseComplete }: PDFUploadProps, ref: ForwardedRef<PDFUploadRef>) => {
    const { user, login } = useAuth()
    const userId = user ? (user.dbId ? String(user.dbId) : user.id) : undefined
    const [isDragging, setIsDragging] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [previousDocuments, setPreviousDocuments] = useState<UploadedDocument[]>([])
    const [recentDocumentId, setRecentDocumentId] = useState<string | null>(null)
    const [loadingDocuments, setLoadingDocuments] = useState(true)
    const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { toast } = useToast()

    const loadPreviousDocuments = useCallback(async () => {
      if (!userId) {
        console.warn("[PDFUpload] Skipping document load - missing user session")
        setLoadingDocuments(false)
        return
      }
      try {
        setLoadingDocuments(true)
        const response = await fetch(DOCUMENTS_API_BASE, {
          headers: {
            "X-User-Id": userId,
          },
          cache: "no-store",
          credentials: "include",
        })
        if (!response.ok) {
          throw new Error("Failed to fetch documents")
        }
        const data = (await response.json()) as { documents?: UploadedDocument[] }
        const docs = data.documents || []
        setPreviousDocuments(docs)
        setRecentDocumentId((current: string | null) =>
          current && !docs.some((doc) => doc._id === current) ? null : current,
        )
        setSelectedDocuments([])
      } catch (error) {
        console.error("[PDFUpload] Failed to load previous documents:", error)
      } finally {
        setLoadingDocuments(false)
      }
    }, [userId])

    useEffect(() => {
      loadPreviousDocuments()
    }, [loadPreviousDocuments])

    useImperativeHandle(ref, () => ({
      triggerFilePicker: () => {
        fileInputRef.current?.click()
      },
    }))

    const toggleDocumentSelection = useCallback((documentId: string) => {
      setSelectedDocuments((prev: string[]) => {
        if (prev.includes(documentId)) {
          return prev.filter((id) => id !== documentId)
        }
        return [...prev, documentId]
      })
    }, [])

    const clearChatCacheForDocuments = useCallback((docs: UploadedDocument[]) => {
      if (typeof window === "undefined") return
      docs.forEach((doc: UploadedDocument) => {
        const names = new Set<string>()
        if (doc.original_filename) {
          names.add(doc.original_filename.trim())
        }
        if (doc.title) {
          names.add(doc.title.trim())
        }
        if (doc.original_filename && doc.original_filename.endsWith(".pdf")) {
          names.add(doc.original_filename.replace(/\.pdf$/i, "").trim())
        }
        if (doc.title && doc.title.endsWith(".pdf")) {
          names.add(doc.title.replace(/\.pdf$/i, "").trim())
        }

        names.forEach((name: string) => {
          const trimmed = name.trim()
          if (!trimmed) return
          const keys = new Set<string>([
            `chat_messages_${trimmed}`,
            `chat_messages_${trimmed.replace(/\.pdf$/i, "")}`,
          ])
          keys.forEach((key: string) => {
            if (!key || key.endsWith("_")) return
            try {
              localStorage.removeItem(key)
              console.log(`[PDFUpload] Cleared chat cache key: ${key}`)
            } catch (error) {
              console.warn(`[PDFUpload] Failed to clear chat cache key ${key}:`, error)
            }
          })
        })
      })
    }, [])

    const handleDeleteDocuments = useCallback(
      async (options: { ids?: string[]; deleteAll?: boolean; toastMessage?: string }) => {
        if (isDeleting) return
        try {
          if (!userId) {
            toast({
              title: "Not signed in",
              description: "Please sign in to manage documents.",
              variant: "destructive",
            })
            login()
            return
          }
          setIsDeleting(true)
          const response = await fetch(`${DOCUMENTS_API_BASE}/delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-User-Id": userId,
            },
            body: JSON.stringify({
              documentIds: options.ids,
              deleteAll: options.deleteAll,
            }),
            credentials: "include",
          })

          if (!response.ok) {
            throw new Error("Delete failed")
          }

          const result = await response.json()
          if (options.deleteAll) {
            clearChatCacheForDocuments(previousDocuments)
          } else if (options.ids && options.ids.length > 0) {
            const docsToClear = previousDocuments.filter((doc: UploadedDocument) => options.ids?.includes(doc._id))
            clearChatCacheForDocuments(docsToClear)
          }
          await loadPreviousDocuments()
          setSelectedDocuments([])

          toast({
            title: "Documents deleted",
            description:
              options.toastMessage ||
              (result.deletedCount
                ? `Removed ${result.deletedCount} document${result.deletedCount > 1 ? "s" : ""}`
                : "Documents removed"),
          })
        } catch (error) {
          console.error("[PDFUpload] Failed to delete documents:", error)
          toast({
            title: "Delete failed",
            description: "Could not delete documents. Please try again.",
            variant: "destructive",
          })
        } finally {
          setIsDeleting(false)
        }
      },
      [clearChatCacheForDocuments, isDeleting, loadPreviousDocuments, login, previousDocuments, toast, userId],
    )

    const handleDeleteSingleDocument = useCallback(
      async (documentId: string) => {
        const confirmed = window.confirm("Delete this document?")
        if (!confirmed) return
        await handleDeleteDocuments({ ids: [documentId], toastMessage: "Document removed" })
      },
      [handleDeleteDocuments],
    )

    const handleDeleteSelected = useCallback(async () => {
      if (selectedDocuments.length === 0) return
      const confirmed = window.confirm(`Delete ${selectedDocuments.length} selected document(s)?`)
      if (!confirmed) return
      await handleDeleteDocuments({ ids: selectedDocuments })
    }, [handleDeleteDocuments, selectedDocuments])

    const handleDeleteAll = useCallback(async () => {
      if (previousDocuments.length === 0) return
      const confirmed = window.confirm("Delete all uploaded documents?")
      if (!confirmed) return
      await handleDeleteDocuments({ deleteAll: true, toastMessage: "All documents removed" })
    }, [handleDeleteDocuments, previousDocuments.length])

    const handleFile = useCallback(
      async (file: File) => {
        if (file.type !== "application/pdf") {
          toast({
            title: "Invalid file type",
            description: "Please upload a PDF file",
            variant: "destructive",
          })
          return
        }

        if (!userId) {
          toast({
            title: "Not signed in",
            description: "Please sign in to upload PDFs.",
            variant: "destructive",
          })
          login()
          return
        }

        setIsUploading(true)
        const formData = new FormData()
        formData.append("file", file)

        try {
          const response = await fetch(DOCUMENTS_API_BASE, {
            method: "POST",
            headers: {
              "X-User-Id": userId,
            },
            body: formData,
            credentials: "include",
          })

          if (!response.ok) {
            throw new Error("Upload failed")
          }

          const result = (await response.json()) as { documentId?: string | null }
          const newDocumentId = typeof result.documentId === "string" ? result.documentId : null

          toast({
            title: "PDF uploaded",
            description: `${file.name} was added to your library`,
          })

          await loadPreviousDocuments()
          if (newDocumentId) {
            setRecentDocumentId(newDocumentId)
          }

          // Dispatch event to notify all PDF readers to refresh their document lists
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("pdf-uploaded", { detail: { documentId: newDocumentId } }))
          }
        } catch (error) {
          console.error("[v0] Upload error:", error)
          toast({
            title: "Upload failed",
            description: "Could not upload the PDF. Please try again.",
            variant: "destructive",
          })
        } finally {
          setIsUploading(false)
        }
      },
      [loadPreviousDocuments, login, toast, userId],
    )

    const handleSelectPreviousDocument = useCallback(
      async (document: UploadedDocument) => {
        try {
          setIsUploading(true)
          const url = document.fileUrl ?? document.downloadUrl
          if (!url) {
            throw new Error("Document URL unavailable")
          }
          const headers = userId
            ? {
              "X-User-Id": userId,
            }
            : undefined
          const response = await fetch(url, { cache: "no-store", headers, credentials: "include" })
          if (!response.ok) {
            throw new Error("Failed to download document")
          }
          const blob = await response.blob()
          const file = new File([blob], document.original_filename, { type: "application/pdf" })
          onFileSelect(file)
          toast({
            title: "Document loaded",
            description: `Loaded ${document.original_filename}`,
          })
        } catch (error) {
          console.error("[PDFUpload] Failed to load document:", error)
          toast({
            title: "Failed to load document",
            description: "There was an error loading the document",
            variant: "destructive",
          })
        } finally {
          setIsUploading(false)
        }
      },
      [onFileSelect, toast],
    )

    const handleDownloadDocument = useCallback((url: string) => {
      window.open(url, "_blank", "noopener,noreferrer")
    }, [])

    const handleLoadSample = useCallback(async () => {
      setIsUploading(true)

      try {
        console.log("[v0] Loading sample paper")

        // Load the actual PDF file from public directory
        const response = await fetch("/data.pdf")
        const blob = await response.blob()
        const sampleFile = new File([blob], "data.pdf", { type: "application/pdf" })

        // Mock parsed data for the sample paper
        const mockParsedData = {
          title: "Language Agents Achieve Superhuman Synthesis of Scientific Knowledge",
          authors: ["Michael D. Skarlinski", "Sam Cox", "Jon M. Laurent", "et al."],
          sections: [
            { id: "abstract", title: "Abstract", page: 1 },
            { id: "intro", title: "1. Introduction", page: 1 },
            { id: "questions", title: "2. Answering Scientific Questions", page: 2 },
            { id: "performance", title: "3. Performance Analysis of PaperQA2", page: 3 },
            { id: "summarizing", title: "4. Summarizing Scientific Topics", page: 5 },
            { id: "contradictions", title: "5. Detecting Contradictions in Literature", page: 7 },
            { id: "conclusions", title: "6. Conclusions", page: 9 },
            { id: "methods", title: "8. Methods", page: 12 },
          ],
          references: [
            {
              id: "ref1",
              number: 1,
              text: "Smith, J., & Johnson, A. (2023). Machine Learning Approaches to Natural Language Processing. Journal of AI Research, 45(2), 123-145.",
              authors: "Smith, J., & Johnson, A.",
              title: "Machine Learning Approaches to Natural Language Processing",
              year: "2023",
              journal: "Journal of AI Research",
            },
            {
              id: "ref2",
              number: 2,
              text: "Brown, M., Davis, K., & Wilson, R. (2022). Deep Learning for Document Understanding. Proceedings of ACL 2022, pp. 456-478.",
              authors: "Brown, M., Davis, K., & Wilson, R.",
              title: "Deep Learning for Document Understanding",
              year: "2022",
              journal: "Proceedings of ACL 2022",
            },
            {
              id: "ref3",
              number: 3,
              text: "Chen, L., & Zhang, Y. (2024). Transformer Models in Information Retrieval. Nature Machine Intelligence, 6(1), 89-102.",
              authors: "Chen, L., & Zhang, Y.",
              title: "Transformer Models in Information Retrieval",
              year: "2024",
              journal: "Nature Machine Intelligence",
            },
            {
              id: "ref4",
              number: 4,
              text: "Anderson, P., et al. (2023). Attention Mechanisms for Text Analysis. IEEE Transactions on Neural Networks, 34(5), 234-256.",
              authors: "Anderson, P., et al.",
              title: "Attention Mechanisms for Text Analysis",
              year: "2023",
              journal: "IEEE Transactions on Neural Networks",
            },
            {
              id: "ref5",
              number: 5,
              text: "Taylor, S., & Martinez, C. (2022). Neural Architectures for Semantic Understanding. arXiv preprint arXiv:2203.12345.",
              authors: "Taylor, S., & Martinez, C.",
              title: "Neural Architectures for Semantic Understanding",
              year: "2022",
              journal: "arXiv preprint",
            },
          ],
          metadata: {
            pages: 25,
            year: 2024,
            institution: "FutureHouse Inc.",
          },
        }

        console.log("[v0] Sample paper loaded, calling onFileSelect")
        onFileSelect(sampleFile, mockParsedData)

        toast({
          title: "Sample paper loaded",
          description: "Language Agents paper is ready to explore",
        })
      } catch (error) {
        console.error("[v0] Sample load error:", error)
        toast({
          title: "Failed to load sample",
          description: "There was an error loading the sample paper",
          variant: "destructive",
        })
      } finally {
        setIsUploading(false)
      }
    }, [onFileSelect, toast])

    const handleDrop = useCallback(
      (e: DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (file) {
          handleFile(file)
        }
      },
      [handleFile],
    )

    const handleDragOver = useCallback((e: DragEvent) => {
      e.preventDefault()
      setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
    }, [])

    const handleFileInput = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
          handleFile(file)
        }
      },
      [handleFile],
    )

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-8 text-center">
            <h2 className="mb-2 font-mono text-2xl font-medium text-foreground">Upload PDF Document</h2>
            <p className="text-sm text-muted-foreground">
              Upload a PDF to view pages, explore parsed sections, and ask questions
            </p>
          </div>

          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadPreviousDocuments}
                  disabled={loadingDocuments || isDeleting || isUploading}
                >
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={selectedDocuments.length === 0 || isDeleting || loadingDocuments}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={previousDocuments.length === 0 || isDeleting || loadingDocuments}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All
                </Button>
              </div>
            </div>
            {loadingDocuments ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Loading documents...
              </div>
            ) : previousDocuments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No uploaded documents yet. Upload a PDF to see it here.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {previousDocuments.map((doc: UploadedDocument) => (
                  <Card
                    key={doc._id}
                    className={cn(
                      "cursor-pointer border border-border/60 p-3 transition-colors hover:border-primary/70 hover:bg-muted/30",
                      recentDocumentId === doc._id &&
                      "border-amber-400 bg-amber-100/80 shadow-md hover:border-amber-500 hover:bg-amber-100/80 dark:border-amber-400/80 dark:bg-amber-950/40",
                    )}
                    onClick={() => handleSelectPreviousDocument(doc)}
                    aria-label={`Open ${doc.original_filename}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        onClick={(event: MouseEvent<HTMLDivElement>) => {
                          event.stopPropagation()
                        }}
                      >
                        <Checkbox
                          checked={selectedDocuments.includes(doc._id)}
                          onCheckedChange={() => toggleDocumentSelection(doc._id)}
                          disabled={isDeleting}
                          aria-label={`Select ${doc.original_filename}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{doc.title || doc.original_filename}</p>
                              <p className="truncate text-xs text-muted-foreground">{doc.original_filename}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                event.stopPropagation()
                                const url = doc.downloadUrl ?? doc.fileUrl
                                if (url) {
                                  handleDownloadDocument(url)
                                }
                              }}
                              aria-label={`Download ${doc.original_filename}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                event.stopPropagation()
                                void handleDeleteSingleDocument(doc._id)
                              }}
                              disabled={isDeleting}
                              aria-label={`Delete ${doc.original_filename}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {(doc.num_pages ?? 0) > 0 || doc.file_size ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {doc.num_pages && doc.num_pages > 0 && <span>{doc.num_pages} pages</span>}
                            {doc.file_size && <span>{`${(doc.file_size / (1024 * 1024)).toFixed(2)} MB`}</span>}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-lg border-2 border-dashed p-12 transition-colors ${isDragging
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileInput}
              disabled={isUploading}
              className="absolute inset-0 cursor-pointer opacity-0"
              id="pdf-upload"
            />

            <div className="flex flex-col items-center gap-4 text-center">
              {isUploading ? (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="font-mono text-sm text-muted-foreground">Processing PDF...</p>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-primary/10 p-4">
                    <FileText className="h-12 w-12 text-primary" />
                  </div>
                  <div>
                    <p className="mb-1 font-mono text-sm font-medium text-foreground">
                      Drop your PDF here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">Supports PDF files up to 50MB</p>
                  </div>
                  <Button variant="outline" size="sm" className="mt-2 bg-transparent" asChild>
                    <label htmlFor="pdf-upload" className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Select File
                    </label>
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadSample}
              disabled={isUploading}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              Try with Sample Paper (Language Agents)
            </Button>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="mb-2 font-mono text-sm font-medium text-foreground">Features</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• View PDF pages with smooth navigation</li>
              <li>• Browse parsed sections in sidebar</li>
              <li>• Ask questions and get AI-powered answers</li>
              <li>• Highlight relevant paragraphs from context</li>
            </ul>
          </div>
        </div>
      </div>
    )
  })

PDFUpload.displayName = "PDFUpload"
