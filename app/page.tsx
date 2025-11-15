"use client"

import dynamic from "next/dynamic"

const PDFWorkspace = dynamic(() => import("@/components/pdf-workspace").then(mod => ({ default: mod.PDFWorkspace })), {
  ssr: false,
})

export default function Home() {
  return <PDFWorkspace />
}