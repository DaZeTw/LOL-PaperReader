"use client"

import dynamic from "next/dynamic"

const PDFReader = dynamic(() => import("@/components/pdf-reader").then(mod => ({ default: mod.PDFReader })), {
  ssr: false,
})

export default function Home() {
  return <PDFReader />
}
