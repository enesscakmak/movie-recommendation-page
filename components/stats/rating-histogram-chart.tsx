"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

interface RatingHistogramChartProps {
  data: Array<{ rating: string; count: number }>
}

const chartConfig = {
  count: { label: "Films", color: "hsl(var(--chart-you))" },
} satisfies ChartConfig

export function RatingHistogramChart({ data }: RatingHistogramChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How you rate</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="rating" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}★`} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => `${v}★`} />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={3} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
