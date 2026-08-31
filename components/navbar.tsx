"use client"

import Link from "next/link"
import { Film, Star } from "lucide-react"
import { signIn } from "next-auth/react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useProfile } from "@/contexts/profile-context"
import { ProfileMenu } from "@/components/profile/profile-menu"

export default function Navbar() {
  const { profile, isLoading } = useProfile()

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
          {!isLoading && (profile ? <ProfileMenu /> : <Button onClick={() => signIn("google")}>Sign in with Google</Button>)}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
