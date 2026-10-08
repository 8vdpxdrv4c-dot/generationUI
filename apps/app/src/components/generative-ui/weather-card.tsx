"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { z } from "zod";

export const WeatherCardProps = z.object({
  city: z
    .string()
    .describe(
      "必填。城市名（如 北京、上海）或 9 位城市编码（如 101030100 表示天津）。只需传这一个参数，卡片会自行获取并刷新数据。"
    ),
  refreshIntervalMs: z
    .number()
    .optional()
    .describe("Polling interval in milliseconds. Defaults to 5000."),
});

type WeatherCardProps = z.infer<typeof WeatherCardProps>;

type WeatherForecastDay = {
  date: string;
  week: string;
  condition: string;
  tempMax: number;
  tempMin: number;
  windDirection: string;
  windScale: string;
  aqi: number | null;
};

type WeatherPayload = {
  cityKey: string;
  city: string;
  province?: string;
  updatedAt: string;
  reportedAt: string | null;
  cached: boolean;
  current: {
    temperature: number;
    humidity: number;
    condition: string;
    windDirection: string;
    windScale: string;
    quality: string;
    pm25: number | null;
    pm10: number | null;
  };
  forecast: WeatherForecastDay[];
  tip?: string;
};

const DEFAULT_INTERVAL_MS = 5000;
/** 与后端 /api/weather 的默认城市保持一致 */
const DEFAULT_CITY = "101030100";

/**
 * 折叠动画：外层用 grid-template-rows 在 0fr / 1fr 之间插值，内层 overflow:hidden
 * 负责裁剪。这样能对「内容自适应高度」做真实的过渡，不需要猜一个 max-height 上限。
 */
const FORECAST_COLLAPSE_TRANSITION =
  "grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1)";
const CHEVRON_TRANSITION = "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)";

/** 「星期二」→「周二」 */
function shortWeek(week: string, date: string): string {
  if (week) return week.replace("星期", "周");
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("zh-CN", { weekday: "short" });
}

/** 「2026-09-22 15:07:04」→「09-22 15:07」 */
function shortReportedAt(value: string | null): string {
  if (!value) return "";
  return value.length >= 16 ? value.slice(5, 16) : value;
}

/** 「西南风」+「1级」→「西南风 1级」 */
function formatWind(direction: string, scale: string): string {
  return [direction, scale].filter(Boolean).join(" ") || "—";
}

export function WeatherCard({ city, refreshIntervalMs }: WeatherCardProps) {
  // 这些参数由 LLM 生成，可能整体缺失或类型不对；此处一律回退到安全默认值，
  // 避免整个卡片因一个参数问题崩成空白。
  const resolvedCity =
    typeof city === "string" && city.trim() ? city.trim() : DEFAULT_CITY;
  const intervalMs =
    typeof refreshIntervalMs === "number" &&
    Number.isFinite(refreshIntervalMs) &&
    refreshIntervalMs > 0
      ? Math.max(2000, refreshIntervalMs)
      : DEFAULT_INTERVAL_MS;

  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  /** 未来 5 天默认收起，点击卡片展开 */
  const [expanded, setExpanded] = useState(false);
  const forecastId = useId();

  const toggleForecast = useCallback(() => {
    // 卡片整体可点击；但用户拖选文字准备复制时不应顺带切换折叠状态
    if (typeof window !== "undefined" && window.getSelection?.()?.toString()) {
      return;
    }
    setExpanded((v) => !v);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const q = encodeURIComponent(resolvedCity);
    try {
      const res = await fetch(`/api/weather?city=${q}`, {
        cache: "no-store",
        signal,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `请求失败 (${res.status})`);
      }
      if (signal?.aborted) return;
      setData(json as WeatherPayload);
      setCheckedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      setError(null);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError((err as Error)?.message || "加载天气失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [resolvedCity]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);

    const timer = window.setInterval(() => {
      void load(controller.signal);
    }, intervalMs);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load, intervalMs]);

  const intervalSeconds = Math.round(intervalMs / 1000);
  const wind = data
    ? formatWind(data.current.windDirection, data.current.windScale)
    : "";
  const reported = shortReportedAt(data?.reportedAt ?? null);

  return (
    <div
      className="rounded-xl border shadow-sm p-5 max-w-md mx-auto my-4 cursor-pointer"
      onClick={toggleForecast}
      style={{
        borderColor: "var(--color-border-tertiary, rgba(0,0,0,0.12))",
        background: "var(--color-background-secondary, var(--background))",
        fontFamily: "var(--font-family)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3
            className="text-lg font-semibold m-0"
            style={{ color: "var(--text-primary, #1a1a1a)" }}
          >
            {data?.city || (loading ? "加载中…" : resolvedCity)}
            {data?.province ? (
              <span
                className="text-xs font-normal ml-2"
                style={{ color: "var(--text-tertiary, #999)" }}
              >
                {data.province}
              </span>
            ) : null}
          </h3>
          <p
            className="text-xs m-0 mt-1"
            style={{ color: "var(--text-tertiary, #999)" }}
          >
            {loading && !data
              ? "正在获取实时天气…"
              : data
                ? `${reported ? `实况 ${reported} · ` : ""}每 ${intervalSeconds} 秒刷新`
                : "—"}
          </p>
          {checkedAt && <p className="text-xs m-0 mt-1" style={{ color: "var(--text-tertiary, #999)" }}>最近检查 {checkedAt} · 气象数据按来源发布周期更新</p>}
        </div>
        <span
          className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0"
          style={{
            background: "var(--color-background-info, #E6F1FB)",
            color: "var(--color-text-info, #185FA5)",
          }}
        >
          {data?.current.condition || (loading ? "加载中" : "—")}
        </span>
      </div>

      {error && (
        <p className="text-sm m-0 mb-3" style={{ color: "var(--color-text-danger, #A32D2D)" }}>
          {error}
        </p>
      )}

      <div
        className="text-5xl font-bold leading-none"
        style={{ color: "var(--text-primary, #1a1a1a)" }}
      >
        {data ? `${Math.round(data.current.temperature)}°C` : "--"}
      </div>
      <p
        className="text-sm mt-2 mb-4"
        style={{ color: "var(--text-secondary, #666)" }}
      >
        {data
          ? [data.current.condition, wind !== "—" ? wind : ""]
              .filter(Boolean)
              .join("，")
          : "等待天气数据"}
      </p>

      <div
        className="grid grid-cols-3 gap-3 pt-3 mb-4"
        style={{ borderTop: "1px solid var(--color-border-tertiary, rgba(0,0,0,0.08))" }}
      >
        <div>
          <div className="text-[11px]" style={{ color: "var(--text-tertiary, #999)" }}>湿度</div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary, #1a1a1a)" }}>
            {data ? `${Math.round(data.current.humidity)}%` : "--"}
          </div>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: "var(--text-tertiary, #999)" }}>风力</div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary, #1a1a1a)" }}>
            {data ? wind : "--"}
          </div>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: "var(--text-tertiary, #999)" }}>空气质量</div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary, #1a1a1a)" }}>
            {data
              ? `${data.current.quality}${
                  data.current.pm25 != null ? `·${Math.round(data.current.pm25)}` : ""
                }`
              : "--"}
          </div>
        </div>
      </div>

      {/* 未来 5 天：默认收起，点这一行或点卡片任意位置都能展开 / 收起 */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={forecastId}
        onClick={(e) => {
          // 卡片根节点也绑了同一个切换逻辑，这里必须阻止冒泡，否则会被切两次
          e.stopPropagation();
          toggleForecast();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          margin: 0,
          padding: "12px 0 0",
          border: "none",
          borderTop: "1px solid var(--color-border-tertiary, rgba(0,0,0,0.08))",
          background: "transparent",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--text-primary, #1a1a1a)" }}
        >
          未来 5 天
        </span>
        <span
          className="flex items-center gap-1 text-[11px]"
          style={{ color: "var(--text-tertiary, #999)" }}
        >
          {expanded ? "点击收起" : "点击展开"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: CHEVRON_TRANSITION,
            }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div
        id={forecastId}
        aria-hidden={!expanded}
        style={{
          display: "grid",
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: FORECAST_COLLAPSE_TRANSITION,
        }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="grid grid-cols-5 gap-1.5 pt-3">
            {(data?.forecast?.length
              ? data.forecast
              : Array.from({ length: 5 }, (_, i) => null)
            ).map((day, i) => (
              <div
                key={day?.date ?? i}
                className="rounded-lg px-1 py-2 text-center"
                style={{
                  background: "var(--color-background-primary, rgba(0,0,0,0.03))",
                  border: "1px solid var(--color-border-tertiary, rgba(0,0,0,0.06))",
                }}
              >
                <div className="text-[10px] mb-1" style={{ color: "var(--text-tertiary, #999)" }}>
                  {day ? shortWeek(day.week, day.date) : "--"}
                </div>
                <div className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary, #666)" }}>
                  {day?.condition ?? "—"}
                </div>
                <div className="text-[11px] font-semibold mt-1" style={{ color: "var(--text-primary, #1a1a1a)" }}>
                  {day ? `${Math.round(day.tempMax)}°` : "--"}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary, #999)" }}>
                  {day ? `${Math.round(day.tempMin)}°` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data?.tip ? (
        <p
          className="text-[11px] m-0 mt-3"
          style={{ color: "var(--text-tertiary, #999)" }}
        >
          {data.tip}
        </p>
      ) : null}
    </div>
  );
}
