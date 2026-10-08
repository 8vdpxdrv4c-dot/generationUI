"use client"

import { ArrowDownFromLine, ArrowUpFromLine, TrendingUp } from "lucide-react"
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "雷达图 · 图标示例"

const chartData = [
  { month: "1月", desktop: 186, mobile: 80 },
  { month: "2月", desktop: 305, mobile: 200 },
  { month: "3月", desktop: 237, mobile: 120 },
  { month: "4月", desktop: 73, mobile: 190 },
  { month: "5月", desktop: 209, mobile: 130 },
  { month: "6月", desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: "桌面端",
    color: "var(--chart-1)",
    icon: ArrowDownFromLine,
  },
  mobile: {
    label: "移动端",
    color: "var(--chart-2)",
    icon: ArrowUpFromLine,
  },
} satisfies ChartConfig

export function ChartRadarIcons() {
  return (
    <Card>
      <CardHeader className="items-center pb-4">
        <CardTitle>雷达图 · 图标</CardTitle>
        <CardDescription>
          最近六个月的访客总数
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <RadarChart
            data={chartData}
            margin={{
              top: -40,
              bottom: -10,
              left: 0,
              right: 0,
            }}
          >
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <PolarAngleAxis dataKey="month" />
            <PolarGrid />
            <Radar
              dataKey="desktop"
              fill="var(--color-desktop)"
              fillOpacity={0.6}
            />
            <Radar dataKey="mobile" fill="var(--color-mobile)" />
            <ChartLegend className="mt-8" content={<ChartLegendContent />} />
          </RadarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 pt-4 text-sm">
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
