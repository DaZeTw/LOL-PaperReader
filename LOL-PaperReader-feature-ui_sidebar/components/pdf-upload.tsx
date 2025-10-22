"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, FileText, Loader2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

interface PDFUploadProps {
  onFileSelect: (file: File, parsedData: any) => void
}

export function PDFUpload({ onFileSelect }: PDFUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const { toast } = useToast()

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

      setIsUploading(true)

      try {
        console.log("[v0] Uploading file:", file.name)

        // Upload to API
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch("/api/pdf/upload", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          throw new Error("Upload failed")
        }

        const data = await response.json()
        console.log("[v0] Parsed data received:", data)

        onFileSelect(file, data)

        toast({
          title: "PDF uploaded successfully",
          description: `${file.name} has been processed`,
        })
      } catch (error) {
        console.error("[v0] Upload error:", error)
        toast({
          title: "Upload failed",
          description: "There was an error processing your PDF",
          variant: "destructive",
        })
      } finally {
        setIsUploading(false)
      }
    },
    [onFileSelect, toast],
  )

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
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h2 className="mb-2 font-mono text-2xl font-medium text-foreground">Upload PDF Document</h2>
          <p className="text-sm text-muted-foreground">
            Upload a PDF to view pages, explore parsed sections, and ask questions
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative rounded-lg border-2 border-dashed p-12 transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
          }`}
        >
          <input
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
}
