"use client"

import { TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

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

export const description = "面积图 · 百分比堆叠示例"

const chartData = [
  { month: "1月", desktop: 186, mobile: 80, other: 45 },
  { month: "2月", desktop: 305, mobile: 200, other: 100 },
  { month: "3月", desktop: 237, mobile: 120, other: 150 },
  { month: "4月", desktop: 73, mobile: 190, other: 50 },
  { month: "5月", desktop: 209, mobile: 130, other: 100 },
  { month: "6月", desktop: 214, mobile: 140, other: 160 },
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
  other: {
    label: "其他",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

export function ChartAreaStackedExpand() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>面积图 · 百分比堆叠</CardTitle>
        <CardDescription>
          最近六个月的访客总数
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 12,
            }}
            stackOffset="expand"
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
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="other"
              type="natural"
              fill="var(--color-other)"
              fillOpacity={0.1}
              stroke="var(--color-other)"
              stackId="a"
            />
            <Area
              dataKey="mobile"
              type="natural"
              fill="var(--color-mobile)"
              fillOpacity={0.4}
              stroke="var(--color-mobile)"
              stackId="a"
            />
            <Area
              dataKey="desktop"
              type="natural"
              fill="var(--color-desktop)"
              fillOpacity={0.4}
              stroke="var(--color-desktop)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              本月增长 5.2% <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              2024年1月至6月
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
