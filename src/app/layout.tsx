import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  title: "Network Buddy – Land referrals at your dream companies",
  description: "Find contacts at target companies, generate personalized outreach, and track every conversation.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${manrope.variable}`}>
      <body className="min-h-full flex flex-col antialiased font-sans">{children}</body>
    </html>
  )
}
