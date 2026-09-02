"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { allDecades, allGenres, type CatalogMovie } from "@/lib/recommender"

export interface FilterState {
  genres: string[]
  decade: number | null
  minRating: number
}

export const EMPTY_FILTER_STATE: FilterState = { genres: [], decade: null, minRating: 0 }

export function isFilterStateActive(f: FilterState): boolean {
  return f.genres.length > 0 || f.decade !== null || f.minRating > 0
}

interface FilterBarProps {
  catalog: CatalogMovie[]
  value: FilterState
  onChange: (next: FilterState) => void
}

export function FilterBar({ catalog, value, onChange }: FilterBarProps) {
  const genres = allGenres(catalog)
  const decades = allDecades(catalog)
  const activeCount = value.genres.length + (value.decade !== null ? 1 : 0) + (value.minRating > 0 ? 1 : 0)

  const toggleGenre = (g: string) => {
    const next = value.genres.includes(g) ? value.genres.filter((x) => x !== g) : [...value.genres, g]
    onChange({ ...value, genres: next })
  }

  return (
    <div className="mb-8 space-y-3">
      <div className="flex flex-wrap gap-2">
        {genres.map((g) => {
          const active = value.genres.includes(g)
          return (
            <button key={g} type="button" onClick={() => toggleGenre(g)} aria-pressed={active}>
              <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                {g}
              </Badge>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={value.decade === null ? "all" : String(value.decade)}
          onValueChange={(v) => onChange({ ...value, decade: v === "all" ? null : Number(v) })}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Any decade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any decade</SelectItem>
            {decades.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}s
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            Min average rating {value.minRating > 0 ? value.minRating.toFixed(1) : "any"}
          </span>
          <Slider
            value={[value.minRating]}
            min={0}
            max={5}
            step={0.5}
            onValueChange={([v]) => onChange({ ...value, minRating: v })}
            className="max-w-[160px]"
          />
        </div>

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTER_STATE)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters ({activeCount})
          </Button>
        )}
      </div>
    </div>
  )
}
