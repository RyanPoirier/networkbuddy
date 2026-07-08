import type { Metadata } from "next"
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google"
import "./globals.css"

// Display font — headings & wordmark
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
})

// Body font
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
})

export const metadata: Metadata = {
  title: "Network Buddy – Land referrals at your dream companies",
  description: "Find contacts at target companies, generate personalized outreach, and track every conversation.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${bricolage.variable} ${hanken.variable}`}>
      <body className="min-h-full flex flex-col antialiased font-sans">{children}</body>
    </html>
  )
}
