"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "折线图 · 线性示例"

const chartData = [
  { month: "1月", desktop: 186 },
  { month: "2月", desktop: 305 },
  { month: "3月", desktop: 237 },
  { month: "4月", desktop: 73 },
  { month: "5月", desktop: 209 },
  { month: "6月", desktop: 214 },
]

const chartConfig = {
  desktop: {
    label: "桌面端",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ChartLineLinear() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>折线图 · 线性</CardTitle>
        <CardDescription>2024年1月至6月</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Line
              dataKey="desktop"
              type="linear"
              stroke="var(--color-desktop)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          本月增长 5.2% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-muted-foreground">
          最近六个月的访客总数
        </div>
      </CardFooter>
    </Card>
  )
}
