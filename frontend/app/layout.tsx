import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { Inter_Tight, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import Providers from "./providers"

const instrumentSans = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
})

export const metadata: Metadata = {
  title: "v0 App",
  description: "Created with v0",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${instrumentSans.variable} ${jetbrainsMono.variable}`}>
        <Suspense fallback={null}><Providers>{children}</Providers></Suspense>
        <Analytics />
      </body>
    </html>
  )
}
