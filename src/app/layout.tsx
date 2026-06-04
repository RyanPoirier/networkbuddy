import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "NetworkBuddy – Student Networking Tool",
  description: "Get referrals at your target companies by finding contacts and generating personalized outreach messages.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  )
}
