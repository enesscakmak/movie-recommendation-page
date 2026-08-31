import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/theme-provider"
import { ProfileProvider } from "@/contexts/profile-context"
import Navbar from "@/components/navbar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MovieMind - Personalized Movie Recommendations",
  description: "Get personalized movie recommendations based on your preferences using machine learning",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider>
            <ProfileProvider>
              <div className="flex min-h-screen flex-col">
                <Navbar />
                <div className="flex-1">{children}</div>
              </div>
            </ProfileProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
