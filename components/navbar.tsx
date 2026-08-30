"use client"

import { useState } from "react"
import Link from "next/link"
import { Film, Star } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth-context"
import { UserAccountNav } from "@/components/auth/user-account-nav"
import { AuthDialog } from "@/components/auth/auth-dialog"

export default function Navbar() {
  const { user } = useAuth()
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")

  const openSignIn = () => {
    setAuthMode("signin")
    setAuthDialogOpen(true)
  }

  const openSignUp = () => {
    setAuthMode("signup")
    setAuthDialogOpen(true)
  }

  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Film className="h-6 w-6" />
            <span className="font-bold">MovieMind</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-sm font-medium transition-colors hover:text-primary">
              Home
            </Link>
            <Link
              href="/rate"
              className="text-sm font-medium transition-colors hover:text-primary flex items-center gap-1"
            >
              <Star className="h-4 w-4" />
              Rate Movies
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <UserAccountNav />
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={openSignIn}>
                Sign In
              </Button>
              <Button onClick={openSignUp}>Sign Up</Button>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>

      <AuthDialog mode={authMode} isOpen={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
    </header>
  )
}

