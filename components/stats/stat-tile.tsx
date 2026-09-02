import { Card, CardContent } from "@/components/ui/card"

interface StatTileProps {
  label: string
  value: string
  detail?: string
}

export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  )
}
