import Image from "next/image"
import { Star } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MovieData } from "@/types/movie"

interface MovieCardProps {
  movie: MovieData
}

export default function MovieCard({ movie }: MovieCardProps) {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <Image
          src={movie.image || "/placeholder.svg"}
          alt={movie.title}
          fill
          className="object-cover transition-transform hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-lg line-clamp-1">{movie.title}</h3>
          <div className="flex items-center gap-1 text-yellow-500">
            <Star className="h-4 w-4 fill-current" />
            <span className="text-sm font-medium">{movie.rating}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm line-clamp-3 mb-3">{movie.description}</p>
      </CardContent>
      <CardFooter className="px-4 pb-4 pt-0 flex justify-between">
        <Badge variant="outline">{movie.genre}</Badge>
        <span className="text-sm text-muted-foreground">{movie.year}</span>
      </CardFooter>
    </Card>
  )
}

