"use client"

import { Bar, BarChart, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "图表提示 · 数值格式化示例"

const chartData = [
  { date: "2024-07-15", running: 450, swimming: 300 },
  { date: "2024-07-16", running: 380, swimming: 420 },
  { date: "2024-07-17", running: 520, swimming: 120 },
  { date: "2024-07-18", running: 140, swimming: 550 },
  { date: "2024-07-19", running: 600, swimming: 350 },
  { date: "2024-07-20", running: 480, swimming: 400 },
]

const chartConfig = {
  running: {
    label: "跑步",
    color: "var(--chart-1)",
  },
  swimming: {
    label: "游泳",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ChartTooltipFormatter() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>图表提示 · 数值格式化</CardTitle>
        <CardDescription>自定义数值显示格式。</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => {
                return new Date(value).toLocaleDateString("zh-CN", {
                  weekday: "short",
                })
              }}
            />
            <Bar
              dataKey="running"
              stackId="a"
              fill="var(--color-running)"
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="swimming"
              stackId="a"
              fill="var(--color-swimming)"
              radius={[4, 4, 0, 0]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex min-w-[130px] items-center text-xs text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label ||
                        name}
                      <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium text-foreground tabular-nums">
                        {value}
                        <span className="font-normal text-muted-foreground">
                          千卡
                        </span>
                      </div>
                    </div>
                  )}
                />
              }
              cursor={false}
              defaultIndex={1}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
