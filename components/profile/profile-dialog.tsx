"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProfile } from "@/contexts/profile-context"
import { Loader2, Lock, User } from "lucide-react"

interface ProfileDialogProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: "switch" | "new"
}

export function ProfileDialog({ isOpen, onClose, defaultTab = "switch" }: ProfileDialogProps) {
  const { profiles, signIn, createProfile } = useProfile()
  const [tab, setTab] = useState<"switch" | "new">(defaultTab)

  const [unlocking, setUnlocking] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const reset = () => {
    setUnlocking(null)
    setPassword("")
    setSwitchError(null)
    setDisplayName("")
    setUsername("")
    setNewPassword("")
    setCreateError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const trySignIn = async (name: string, pwd?: string) => {
    setSwitchError(null)
    setSwitching(true)
    try {
      await signIn(name, pwd)
      handleClose()
    } catch (err) {
      if (err instanceof Error && err.message === "This profile has a password.") {
        setUnlocking(name)
      } else {
        setSwitchError(err instanceof Error ? err.message : "Could not switch profiles.")
      }
    } finally {
      setSwitching(false)
    }
  }

  const handleCreate = async () => {
    setCreateError(null)
    setCreating(true)
    try {
      await createProfile({ displayName, username, password: newPassword || undefined })
      handleClose()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create a profile.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Browser profiles</DialogTitle>
          <DialogDescription>
            Ratings are stored only in this browser - there is no account and nothing is sent anywhere.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "switch" | "new")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="switch">Switch profile</TabsTrigger>
            <TabsTrigger value="new">New profile</TabsTrigger>
          </TabsList>

          <TabsContent value="switch" className="space-y-3 pt-2">
            {profiles.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No profiles in this browser yet. Create one to start rating movies.
              </p>
            )}
            <div className="space-y-2">
              {profiles.map((p) => (
                <div key={p.id} className="rounded-md border p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    onClick={() => trySignIn(p.username)}
                    disabled={switching}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{p.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.ratingCount} rating{p.ratingCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    {p.hasPassword && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {unlocking === p.username && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && trySignIn(p.username, password)}
                        autoFocus
                      />
                      <Button onClick={() => trySignIn(p.username, password)} disabled={switching}>
                        {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {switchError && <p className="text-sm text-destructive">{switchError}</p>}
          </TabsContent>

          <TabsContent value="new" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-username">Name</Label>
              <Input
                id="new-username"
                placeholder="e.g. Ada"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-display">Display name (optional)</Label>
              <Input
                id="new-display"
                placeholder="Shown in the header"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password (optional)</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Only needed if this browser is shared"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <Button className="w-full" onClick={handleCreate} disabled={creating || !username.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create profile"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
