/** Pre-built templates that ship with the app */
import chartReferences from "@/data/shadcn-charts.json";
import dashboardReferences from "@/data/dashboard-templates.json";

export interface SeedTemplate {
  id: string;
  name: string;
  description: string;
  html: string;
  data_description: string;
  created_at: string;
  version: number;
  kind: "page" | "component";
  preview_width?: number;
  preview_height?: number;
  reference_order?: number;
  asset_paths?: string[];
}

const weatherHtml = `<style>
.weather-card {
  font-family: var(--font-sans);
  max-width: 380px;
  border-radius: var(--border-radius-xl);
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  padding: 24px;
}
.weather-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.weather-city { font-size: 18px; font-weight: 600; color: var(--color-text-primary); }
.weather-date { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }
.weather-badge {
  font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 999px;
  background: var(--color-background-info); color: var(--color-text-info);
}
.weather-temp { font-size: 48px; font-weight: 700; color: var(--color-text-primary); line-height: 1; }
.weather-desc { font-size: 14px; color: var(--color-text-secondary); margin-top: 4px; }
.weather-details {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  margin-top: 20px; padding-top: 16px;
  border-top: 0.5px solid var(--color-border-tertiary);
}
.weather-detail-label { font-size: 11px; color: var(--color-text-tertiary); }
.weather-detail-value { font-size: 14px; font-weight: 600; color: var(--color-text-primary); margin-top: 2px; }
</style>
<div class="weather-card">
  <div class="weather-header">
    <div>
      <div class="weather-city">上海市</div>
      <div class="weather-date">2026年3月25日 星期二</div>
    </div>
    <span class="weather-badge">多云</span>
  </div>
  <div class="weather-temp">22°C</div>
  <div class="weather-desc">多云，西南风轻拂</div>
  <div class="weather-details">
    <div>
      <div class="weather-detail-label">湿度</div>
      <div class="weather-detail-value">54%</div>
    </div>
    <div>
      <div class="weather-detail-label">风力</div>
      <div class="weather-detail-value">西南风 1级</div>
    </div>
    <div>
      <div class="weather-detail-label">空气质量</div>
      <div class="weather-detail-value">优</div>
    </div>
  </div>
</div>`;

const invoiceHtml = `<style>
.invoice-card {
  font-family: var(--font-sans);
  max-width: 420px;
  border-radius: var(--border-radius-xl);
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  padding: 24px;
}
.invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.invoice-title { font-size: 18px; font-weight: 600; color: var(--color-text-primary); }
.invoice-subtitle { font-size: 12px; color: var(--color-text-tertiary); margin-top: 2px; }
.invoice-badge {
  font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 999px;
  background: var(--color-background-warning); color: var(--color-text-warning);
}
.invoice-amount { font-size: 36px; font-weight: 700; color: var(--color-text-primary); margin: 12px 0 4px; }
.invoice-for { font-size: 13px; color: var(--color-text-secondary); }
.invoice-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  margin-top: 16px; padding-top: 16px;
  border-top: 0.5px solid var(--color-border-tertiary);
}
.invoice-label { font-size: 11px; color: var(--color-text-tertiary); }
.invoice-value { font-size: 14px; font-weight: 500; color: var(--color-text-primary); margin-top: 2px; }
.invoice-actions { display: flex; gap: 8px; margin-top: 20px; }
.invoice-actions button {
  flex: none; font-size: 13px; padding: 8px 18px;
  border-radius: var(--border-radius-md);
}
</style>
<div class="invoice-card">
  <div class="invoice-header">
    <div>
      <div class="invoice-title">月度发票</div>
      <div class="invoice-subtitle">常年客户账单周期的入门卡片</div>
    </div>
    <span class="invoice-badge">草稿</span>
  </div>
  <div class="invoice-amount">¥17,500</div>
  <div class="invoice-for">产品设计顾问与月度支持服务</div>
  <div class="invoice-grid">
    <div>
      <div class="invoice-label">客户</div>
      <div class="invoice-value">北风实验室</div>
    </div>
    <div>
      <div class="invoice-label">账期</div>
      <div class="invoice-value">2026年3月</div>
    </div>
    <div>
      <div class="invoice-label">发票编号</div>
      <div class="invoice-value">INV-3201</div>
    </div>
    <div>
      <div class="invoice-label">到期日</div>
      <div class="invoice-value">2026年4月5日</div>
    </div>
  </div>
  <div class="invoice-actions">
    <button onclick="Websandbox.connection.remote.sendPrompt({ text: '发送这张发票' })">发送发票</button>
    <button onclick="Websandbox.connection.remote.sendPrompt({ text: '展开为完整发票' })">展开完整发票 ↗</button>
  </div>
</div>`;

const dashboardHtml = `<style>
.dash {
  font-family: var(--font-sans);
  width: 100%; min-height: 100vh;
  border-radius: var(--border-radius-xl);
  background: var(--color-background-secondary);
  border: 0.5px solid var(--color-border-tertiary);
  padding: clamp(16px, 4vw, 48px);
}
.dash-title { font-size: 18px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px; }
.dash-subtitle { font-size: 12px; color: var(--color-text-tertiary); margin-bottom: 20px; }
.dash-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
.dash-kpi {
  padding: 12px; border-radius: var(--border-radius-md);
  background: var(--color-background-primary);
  border: 0.5px solid var(--color-border-tertiary);
}
.dash-kpi-label { font-size: 11px; color: var(--color-text-tertiary); }
.dash-kpi-value { font-size: 22px; font-weight: 700; color: var(--color-text-primary); margin-top: 2px; }
.dash-kpi-change { font-size: 11px; margin-top: 2px; }
.dash-kpi-change.up { color: var(--color-text-success); }
.dash-kpi-change.down { color: var(--color-text-danger); }
.dash-chart { margin-bottom: 16px; }
.dash-chart-title { font-size: 13px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 8px; }
.dash-bars { display: flex; align-items: flex-end; gap: 6px; height: 100px; }
.dash-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dash-bar {
  width: 100%; border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, rgba(99,102,241,0.7), rgba(16,185,129,0.5));
  transition: height 0.3s ease;
}
.dash-bar-label { font-size: 10px; color: var(--color-text-tertiary); }
.dash-legend { display: flex; gap: 16px; padding-top: 12px; border-top: 0.5px solid var(--color-border-tertiary); }
.dash-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-secondary); }
.dash-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
</style>
<div class="dash">
  <header style="display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid var(--color-border-tertiary);padding-bottom:20px;margin-bottom:24px"><strong>经营分析中心</strong><span>总览 / 季度报表</span></header>
  <div class="dash-title">2026 年 Q1 业绩</div>
  <div class="dash-subtitle">收入、用户与转化指标 — 2026 年 1 月至 3 月</div>
  <div class="dash-kpis">
    <div class="dash-kpi">
      <div class="dash-kpi-label">收入</div>
      <div class="dash-kpi-value">¥284万</div>
      <div class="dash-kpi-change up">较 Q4 +12.3%</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi-label">活跃用户</div>
      <div class="dash-kpi-value">1.82万</div>
      <div class="dash-kpi-change up">较 Q4 +8.1%</div>
    </div>
    <div class="dash-kpi">
      <div class="dash-kpi-label">转化率</div>
      <div class="dash-kpi-value">3.4%</div>
      <div class="dash-kpi-change down">较 Q4 -0.2%</div>
    </div>
  </div>
  <div class="dash-chart">
    <div class="dash-chart-title">月度收入</div>
    <div class="dash-bars">
      <div class="dash-bar-col"><div class="dash-bar" style="height:65%"></div><div class="dash-bar-label">1月</div></div>
      <div class="dash-bar-col"><div class="dash-bar" style="height:78%"></div><div class="dash-bar-label">2月</div></div>
      <div class="dash-bar-col"><div class="dash-bar" style="height:100%"></div><div class="dash-bar-label">3月</div></div>
    </div>
  </div>
  <div class="dash-legend">
    <div class="dash-legend-item"><div class="dash-legend-dot" style="background: var(--color-text-success)"></div>高于目标</div>
    <div class="dash-legend-item"><div class="dash-legend-dot" style="background: var(--color-text-danger)"></div>低于目标</div>
    <div class="dash-legend-item"><div class="dash-legend-dot" style="background: var(--color-text-tertiary)"></div>持平</div>
  </div>
  <footer style="margin-top:40px;font-size:12px;color:var(--color-text-tertiary)">页面模板 · 所有数值为样例，仅供布局参考</footer>
</div>`;

export const SEED_IDS = new Set(["seed-weather-001", "seed-invoice-001", "seed-dashboard-001", ...chartReferences.map((chart) => chart.id), ...dashboardReferences.map((template) => template.id)]);

export const SEED_TEMPLATES: SeedTemplate[] = [
  ...dashboardReferences.map((template) => ({ ...template, kind: "page" as const })),
  ...chartReferences.map((chart) => ({ ...chart, kind: "component" as const })),
  {
    id: "seed-weather-001",
    kind: "component",
    name: "天气卡片",
    description: "展示温度、湿度、风力等级和空气质量的当前天气卡片",
    html: weatherHtml,
    data_description: "城市、日期、气温、天气状况、湿度、风向/风力等级、空气质量（等级与 PM2.5）、未来 5 天预报",
    created_at: "2026-01-01T00:00:00.000Z",
    version: 1,
  },
  {
    id: "seed-invoice-001",
    kind: "component",
    name: "发票卡片",
    description: "含金额、客户信息与操作按钮的紧凑发票卡",
    html: invoiceHtml,
    data_description: "标题、金额、说明、客户名、账期、发票编号、到期日",
    created_at: "2026-01-01T00:00:01.000Z",
    version: 1,
  },
  {
    id: "seed-dashboard-001",
    kind: "page",
    name: "业绩仪表盘",
    description: "完整经营分析页面，包含页头、KPI 指标区、月度图表和页脚",
    html: dashboardHtml,
    data_description: "标题、副标题、KPI 标签/数值/变化、月度柱状图数据、图例项",
    created_at: "2026-01-01T00:00:02.000Z",
    version: 1,
  },
];
