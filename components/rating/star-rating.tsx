"use client"

import { useState } from "react"
import { Star } from "lucide-react"

interface StarRatingProps {
  value?: number
  max?: number
  size?: "sm" | "md" | "lg"
  onChange?: (rating: number) => void
  readOnly?: boolean
}

const SIZE_PX = { sm: 16, md: 24, lg: 32 }

export function StarRating({ value = 0, max = 5, size = "md", onChange, readOnly = false }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const px = SIZE_PX[size]
  const shown = hover ?? value

  const valueFromEvent = (i: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const half = e.clientX - rect.left < rect.width / 2
    return i + (half ? 0.5 : 1)
  }

  return (
    <div className="flex" onMouseLeave={() => !readOnly && setHover(null)}>
      {Array.from({ length: max }, (_, i) => {
        const full = shown >= i + 1
        const halfFilled = !full && shown >= i + 0.5
        return (
          <button
            key={i}
            type="button"
            className={readOnly ? "cursor-default p-0.5" : "cursor-pointer p-0.5"}
            style={{ width: px + 4, height: px + 4 }}
            disabled={readOnly}
            onMouseMove={(e) => !readOnly && setHover(valueFromEvent(i, e))}
            onClick={(e) => {
              if (readOnly || !onChange) return
              const next = valueFromEvent(i, e)
              onChange(next === value ? 0 : next)
            }}
            aria-label={`Rate ${i + 1} out of ${max} stars`}
          >
            <span className="relative block" style={{ width: px, height: px }}>
              <Star className="absolute inset-0 text-muted-foreground" width={px} height={px} />
              {(full || halfFilled) && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: full ? px : px / 2 }}>
                  <Star className="text-yellow-400 fill-yellow-400" width={px} height={px} />
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
