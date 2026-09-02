"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

interface GenreComparisonChartProps {
  data: Array<{ genre: string; you: number; population: number }>
}

const chartConfig = {
  you: { label: "You", color: "hsl(var(--chart-you))" },
  population: { label: "Typical viewer", color: "hsl(var(--muted-foreground))" },
} satisfies ChartConfig

function formatShare(value: number | string) {
  return `${(Number(value) * 100).toFixed(1)}%`
}

export function GenreComparisonChart({ data }: GenreComparisonChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your genres vs. the typical MovieLens viewer</CardTitle>
        <p className="text-sm text-muted-foreground">Share of rating volume that falls in each genre.</p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[380px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={formatShare} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="genre" width={90} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatShare(value as number)} />} />
            <Bar dataKey="you" fill="var(--color-you)" radius={3} />
            <Bar dataKey="population" fill="var(--color-population)" radius={3} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
