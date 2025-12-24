import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/components/auth-provider"
import { PipelineStatusProvider } from "@/contexts/PipelineStatusContext"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "PDF Reader - Document Analysis Tool",
  description: "Upload, view, and analyze PDF documents with AI-powered Q&A",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AuthProvider>
          <PipelineStatusProvider>
            <Suspense fallback={<div>Loading...</div>}>
              {children}
              <Toaster />
            </Suspense>
          </PipelineStatusProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
