"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { PasswordResetForm } from "@/components/auth/password-reset-form"

type AuthMode = "signin" | "signup" | "reset-password"

interface AuthDialogProps {
  mode: AuthMode
  isOpen: boolean
  onClose: () => void
}

export function AuthDialog({ mode: initialMode, isOpen, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)

  const handleSuccess = () => {
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        {mode === "signin" && (
          <SignInForm
            onSuccess={handleSuccess}
            onSignUpClick={() => setMode("signup")}
            onForgotPasswordClick={() => setMode("reset-password")}
          />
        )}
        {mode === "signup" && <SignUpForm onSuccess={handleSuccess} onSignInClick={() => setMode("signin")} />}
        {mode === "reset-password" && <PasswordResetForm onBackToSignIn={() => setMode("signin")} />}
      </DialogContent>
    </Dialog>
  )
}

