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

export const description = "雷达图 · 仅线条示例"

const chartData = [
  { month: "1月", desktop: 186, mobile: 160 },
  { month: "2月", desktop: 185, mobile: 170 },
  { month: "3月", desktop: 207, mobile: 180 },
  { month: "4月", desktop: 173, mobile: 160 },
  { month: "5月", desktop: 160, mobile: 190 },
  { month: "6月", desktop: 174, mobile: 204 },
]

const chartConfig = {
  desktop: {
    label: "桌面端",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "移动端",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ChartRadarLinesOnly() {
  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>雷达图 · 仅线条</CardTitle>
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
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarAngleAxis dataKey="month" />
            <PolarGrid radialLines={false} />
            <Radar
              dataKey="desktop"
              fill="var(--color-desktop)"
              fillOpacity={0}
              stroke="var(--color-desktop)"
              strokeWidth={2}
            />
            <Radar
              dataKey="mobile"
              fill="var(--color-mobile)"
              fillOpacity={0}
              stroke="var(--color-mobile)"
              strokeWidth={2}
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
