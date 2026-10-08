"use client"

import { TrendingUp } from "lucide-react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"

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

export const description = "雷达图 · 基础示例"

const chartData = [
  { month: "1月", desktop: 186 },
  { month: "2月", desktop: 305 },
  { month: "3月", desktop: 237 },
  { month: "4月", desktop: 273 },
  { month: "5月", desktop: 209 },
  { month: "6月", desktop: 214 },
]

const chartConfig = {
  desktop: {
    label: "桌面端",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ChartRadarDefault() {
  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>雷达图 · 基础</CardTitle>
        <CardDescription>
          最近六个月的访客总数
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <RadarChart data={chartData}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis dataKey="month" />
            <PolarGrid />
            <Radar
              dataKey="desktop"
              fill="var(--color-desktop)"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 leading-none font-medium">
          本月增长 5.2% <TrendingUp className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2 leading-none text-muted-foreground">
          2024年1月至6月
        </div>
      </CardFooter>
    </Card>
  )
}
