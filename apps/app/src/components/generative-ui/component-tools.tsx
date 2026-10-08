"use client";

import type { ComponentProps } from "react";
import type { ReactFrontendTool } from "@copilotkit/react-core/v2";
import { PieChart, PieChartProps } from "./charts/pie-chart";
import { BarChart, BarChartProps } from "./charts/bar-chart";
import { WeatherCard, WeatherCardProps } from "./weather-card";
import { PueGauge, PueGaugeProps } from "./pue-gauge";

// Provider-owned tools survive feature discovery, which replaces the tool list,
// as well as navigation to a generation session and direct history restores.
export const COMPONENT_TOOLS = [
  {
    name: "pieChart",
    description: "Display data as a pie chart.",
    parameters: PieChartProps,
    render: ({ args }) => <PieChart {...args as ComponentProps<typeof PieChart>} />,
  },
  {
    name: "barChart",
    description: "Display data as a bar chart.",
    parameters: BarChartProps,
    render: ({ args }) => <BarChart {...args as ComponentProps<typeof BarChart>} />,
  },
  {
    name: "weatherCard",
    description: "展示真实天气及预报。天气请求优先调用此组件，不要使用模拟数据或 generateSandboxedUi。传 city（中文城市名，例如北京，或9位城市代码），refreshIntervalMs 默认5000。组件自行请求 /api/weather 并定时刷新，点击展开未来5天预报。",
    parameters: WeatherCardProps,
    render: ({ args }) => <WeatherCard {...args as ComponentProps<typeof WeatherCard>} />,
  },
  {
    name: "pueGauge",
    description: "展示 PUE 电能使用效率的固定圆环指针仪表盘，量程0–2。无需参数，自行请求 /get_pue 并每5秒刷新；当前为JSON模拟数据。PUE请求必须使用此组件，不要生成或传入数值。",
    parameters: PueGaugeProps,
    render: () => <PueGauge />,
  },
] satisfies ReactFrontendTool[];
