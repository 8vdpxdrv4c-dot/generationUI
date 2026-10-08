"use client";

import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { PUE_REFRESH_MS, PuePayloadSchema, pueAngle, type PuePayload } from "@/lib/pue";
import styles from "./pue-gauge.module.css";

// No model-supplied values, URLs, or layout options: this is a fixed live component.
export const PueGaugeProps = z.object({});

function point(value: number, radius: number) {
  const angle = pueAngle(value) * Math.PI / 180;
  return { x: 180 + radius * Math.sin(angle), y: 164 - radius * Math.cos(angle) };
}

function arc(from: number, to: number) {
  const start = point(from, 122);
  const end = point(to, 122);
  return `M ${start.x} ${start.y} A 122 122 0 ${to - from > 4 / 3 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

export function PueGauge() {
  const crystalId = useId().replace(/:/g, "");
  const [data, setData] = useState<PuePayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function refresh() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch("/get_pue", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("PUE request failed");
        const next = PuePayloadSchema.parse(await response.json());
        if (!disposed) { setData(next); setError(false); }
      } catch {
        if (!disposed) setError(true);
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(refresh, PUE_REFRESH_MS);
      }
    }

    void refresh();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, []);

  const value = data?.pue;
  return (
    <section className={styles.card} aria-label="PUE 能效仪表盘">
      <header className={styles.header}>
        <div><h2>PUE 能效监测</h2><p>电能使用效率</p></div>
        <span className={styles.badge}>{data?.source === "mock" ? "模拟数据" : data ? "实时数据" : "连接中"}</span>
      </header>
      <svg viewBox="0 0 360 315" className={styles.dial} role="img"
        aria-label={value === undefined ? "PUE 仪表盘，等待数据" : `PUE ${value.toFixed(2)}，量程 0 至 2${error ? "，上次有效值" : ""}`}>
        <defs>
          <linearGradient id={`${crystalId}-ring`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#175bb0" />
            <stop offset="48%" stopColor="#559fdf" />
            <stop offset="72%" stopColor="#c2edff" />
            <stop offset="100%" stopColor="#267be0" />
          </linearGradient>
          <linearGradient id={`${crystalId}-band`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0fcff" />
            <stop offset="48%" stopColor="#77ddff" />
            <stop offset="100%" stopColor="#3495ff" />
          </linearGradient>
          <radialGradient id={`${crystalId}-face`} cx="35%" cy="20%" r="85%">
            <stop offset="0%" stopColor="#7dceff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#12346b" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        <circle cx="180" cy="164" r="108" fill={`url(#${crystalId}-face)`} className={styles.face} />
        <path d={arc(0, 2)} className={styles.track} stroke={`url(#${crystalId}-ring)`} />
        <path d={arc(0, 2)} className={styles.ringHighlight} />
        <path d={arc(1, 1.3)} className={styles.band} stroke={`url(#${crystalId}-band)`} />
        {Array.from({ length: 21 }, (_, i) => {
          const tick = i / 10;
          const major = i % 5 === 0;
          const a = point(tick, 101);
          const b = point(tick, major ? 89 : 95);
          const label = point(tick, 147);
          return <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.tick} strokeWidth={major ? 2 : 1} />
            {major && <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" className={styles.label}>{tick.toFixed(1)}</text>}
          </g>;
        })}
        {value !== undefined && <g transform={`rotate(${pueAngle(value)} 180 164)`} data-testid="pue-needle" className={styles.needle}>
          <path d="M 176 176 L 180 75 L 184 176 Z" fill="currentColor" />
          <path d="M 180 75 L 180 176 L 184 176 Z" fill="#2784e8" />
        </g>}
        <circle cx="180" cy="164" r="8" className={styles.hub} />
        <circle cx="178" cy="162" r="2.5" fill="#effaff" />
        <text x="180" y="227" textAnchor="middle" className={styles.value}>{value === undefined ? "—" : value.toFixed(2)}</text>
        <text x="180" y="253" textAnchor="middle" className={styles.label}>PUE</text>
      </svg>
      <div className={styles.legend}><span />常见范围 1.00–1.30</div>
      <footer className={styles.footer} aria-live="polite">
        {error ? <span role="status" className={styles.error}>更新失败，正在重试{data ? " · 当前为上次有效值" : ""}</span> :
          <span>{data ? `更新时间 ${new Date(data.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}` : "正在获取 PUE…"}</span>}
        <span>每 5 秒刷新</span>
      </footer>
    </section>
  );
}
