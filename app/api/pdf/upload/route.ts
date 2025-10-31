import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const pdfId = randomBytes(16).toString("hex")
    const buffer = Buffer.from(await file.arrayBuffer())

    // Sử dụng đúng URL backend khi chạy Docker (ưu tiên biến môi trường frontend Docker Compose)
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://backend:8000"
    const saveAndParseUrl = `${backendUrl}/api/pdf/save-and-parse/`

    const backendForm = new FormData()
    // ✅ Fix: dùng đúng field name backend yêu cầu
    backendForm.append("files", new Blob([buffer]), file.name)

    console.log(`[PDFUpload] Forwarding ${file.name} to backend: ${saveAndParseUrl}`)

    const resp = await fetch(saveAndParseUrl, {
      method: "POST",
      body: backendForm as any,
      cache: "no-store",
    })

    const text = await resp.text()
    if (!resp.ok) {
      console.error("[PDFUpload] Backend error:", text)
      return NextResponse.json({ error: text }, { status: resp.status })
    }

    const data = JSON.parse(text)
    console.log("[PDFUpload] Success:", data)

    return NextResponse.json({
      message: "PDF uploaded and parsed successfully",
      pdfId,
      backendResult: data,
    })
  } catch (error) {
    console.error("[PDFUpload] Error:", error)
    return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 })
  }
}
