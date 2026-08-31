"use client"

import { useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useProfile } from "@/contexts/profile-context"
import { ProfileDialog } from "@/components/profile/profile-dialog"
import { Repeat, LogOut } from "lucide-react"

export function ProfileMenu() {
  const { profile, signOut, ratingCount } = useProfile()
  const [dialogOpen, setDialogOpen] = useState(false)

  if (!profile) return null

  const initial = profile.displayName.trim().charAt(0).toUpperCase() || "?"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">{profile.displayName}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {ratingCount} rating{ratingCount === 1 ? "" : "s"} in this browser
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Repeat className="mr-2 h-4 w-4" />
            Switch profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
