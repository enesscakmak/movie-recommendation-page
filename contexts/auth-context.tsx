"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

type User = {
  id: string
  name: string
  email: string
  image?: string
  emailVerified?: boolean
}

type AuthContextType = {
  user: User | null
  isLoading: boolean
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithProvider: (provider: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  verifyEmail: (token: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Check if user is logged in on initial load
  useEffect(() => {
    const checkUserLoggedIn = async () => {
      try {
        // In a real app, you would verify the session/token with your backend
        const savedUser = localStorage.getItem("user")
        if (savedUser) {
          setUser(JSON.parse(savedUser))
        }
      } catch (error) {
        console.error("Authentication error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    checkUserLoggedIn()
  }, [])

  const signIn = async (email: string, password: string, rememberMe = false) => {
    setIsLoading(true)
    try {
      // In a real app, you would call your authentication API here
      // This is just a mock implementation
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call

      // Mock user for demo purposes
      const mockUser = {
        id: "user-1",
        name: email.split("@")[0],
        email,
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        emailVerified: true,
      }

      setUser(mockUser)

      // Only store in localStorage if rememberMe is true
      if (rememberMe) {
        localStorage.setItem("user", JSON.stringify(mockUser))
      }
    } catch (error) {
      console.error("Sign in error:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signUp = async (name: string, email: string, password: string) => {
    setIsLoading(true)
    try {
      // In a real app, you would call your registration API here
      // This is just a mock implementation
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call

      // Mock user for demo purposes
      const mockUser = {
        id: "user-" + Date.now(),
        name,
        email,
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        emailVerified: false,
      }

      setUser(mockUser)
      localStorage.setItem("user", JSON.stringify(mockUser))

      // In a real app, you would send a verification email here
      console.log("Verification email sent to:", email)
    } catch (error) {
      console.error("Sign up error:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signInWithProvider = async (provider: string) => {
    setIsLoading(true)
    try {
      // In a real app, you would redirect to the provider's OAuth flow
      // This is just a mock implementation
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call

      // Mock user for demo purposes
      const mockUser = {
        id: `${provider}-user-${Date.now()}`,
        name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
        email: `user@${provider}.com`,
        image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}`,
        emailVerified: true,
      }

      setUser(mockUser)
      localStorage.setItem("user", JSON.stringify(mockUser))
    } catch (error) {
      console.error(`Sign in with ${provider} error:`, error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    setIsLoading(true)
    try {
      // In a real app, you would call your password reset API here
      // This is just a mock implementation
      await new Promise((resolve) => setTimeout(resolve, 1500)) // Simulate API call

      // In a real app, you would send a password reset email
      console.log("Password reset email sent to:", email)
    } catch (error) {
      console.error("Password reset error:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const verifyEmail = async (token: string) => {
    setIsLoading(true)
    try {
      // In a real app, you would call your email verification API here
      // This is just a mock implementation
      await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API call

      if (user) {
        const updatedUser = { ...user, emailVerified: true }
        setUser(updatedUser)
        localStorage.setItem("user", JSON.stringify(updatedUser))
      }
    } catch (error) {
      console.error("Email verification error:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const signOut = async () => {
    setIsLoading(true)
    try {
      // In a real app, you would call your sign out API here
      await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate API call
      setUser(null)
      localStorage.removeItem("user")
    } catch (error) {
      console.error("Sign out error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      signIn, 
      signUp, 
      signOut,
      signInWithProvider,
      resetPassword,
      verifyEmail
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

