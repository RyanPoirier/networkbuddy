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

// Applies the saved (or system) theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('nb-theme');if(t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${bricolage.variable} ${hanken.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased font-sans">{children}</body>
    </html>
  )
}
