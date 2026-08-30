"use client"

import { useState } from "react"
import { Star } from "lucide-react"

interface StarRatingProps {
  initialRating?: number
  max?: number
  size?: "sm" | "md" | "lg"
  onChange?: (rating: number) => void
  readOnly?: boolean
}

export function StarRating({ initialRating = 0, max = 5, size = "md", onChange, readOnly = false }: StarRatingProps) {
  const [rating, setRating] = useState(initialRating)
  const [hoverRating, setHoverRating] = useState(0)

  const sizeClass = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }

  const handleClick = (value: number) => {
    if (readOnly) return

    // Toggle off if clicking the same star
    const newRating = rating === value ? 0 : value
    setRating(newRating)
    if (onChange) onChange(newRating)
  }

  return (
    <div className="flex">
      {[...Array(max)].map((_, i) => {
        const value = i + 1
        return (
          <button
            key={i}
            type="button"
            className={`${readOnly ? "cursor-default" : "cursor-pointer"} p-1`}
            onClick={() => handleClick(value)}
            onMouseEnter={() => !readOnly && setHoverRating(value)}
            onMouseLeave={() => !readOnly && setHoverRating(0)}
            disabled={readOnly}
            aria-label={`Rate ${value} out of ${max}`}
          >
            <Star
              className={`
                ${sizeClass[size]} 
                ${(hoverRating || rating) >= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}
                transition-colors
              `}
            />
          </button>
        )
      })}
    </div>
  )
}

