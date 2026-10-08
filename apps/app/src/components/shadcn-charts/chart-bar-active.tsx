"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis } from "recharts"
import type { BarShapeProps } from "recharts/types/cartesian/Bar"

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

export const description = "柱状图 · 高亮示例"

const chartData = [
  { browser: "chrome", visitors: 187, fill: "var(--color-chrome)" },
  { browser: "safari", visitors: 200, fill: "var(--color-safari)" },
  { browser: "firefox", visitors: 275, fill: "var(--color-firefox)" },
  { browser: "edge", visitors: 173, fill: "var(--color-edge)" },
  { browser: "other", visitors: 90, fill: "var(--color-other)" },
]

const chartConfig = {
  visitors: {
    label: "访客",
  },
  chrome: {
    label: "谷歌浏览器",
    color: "var(--chart-1)",
  },
  safari: {
    label: "苹果浏览器",
    color: "var(--chart-2)",
  },
  firefox: {
    label: "火狐浏览器",
    color: "var(--chart-3)",
  },
  edge: {
    label: "微软浏览器",
    color: "var(--chart-4)",
  },
  other: {
    label: "其他",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

const ACTIVE_INDEX = 2

export function ChartBarActive() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>柱状图 · 高亮</CardTitle>
        <CardDescription>2024年1月至6月</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="browser"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) =>
                chartConfig[value as keyof typeof chartConfig]?.label
              }
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Bar
              dataKey="visitors"
              strokeWidth={2}
              radius={8}
              shape={({ index, ...props }: BarShapeProps) =>
                index === ACTIVE_INDEX ? (
                  <Rectangle
                    {...props}
                    fillOpacity={0.8}
                    stroke={props.payload.fill}
                    strokeDasharray={4}
                    strokeDashoffset={4}
                  />
                ) : (
                  <Rectangle {...props} />
                )
              }
            />
          </BarChart>
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
