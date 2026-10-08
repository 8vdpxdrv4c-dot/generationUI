import { describe, it, expect } from "vitest";
import { SEED_TEMPLATES, SEED_IDS } from "../seed-templates";
import dashboards from "@/data/dashboard-templates.json";

describe("seed templates", () => {
  it("covers exactly the registered seed ids", () => {
    expect(SEED_TEMPLATES.map((t) => t.id).sort()).toEqual(
      [...SEED_IDS].sort()
    );
    for (const t of SEED_TEMPLATES) {
      expect(t.html.trim()).not.toBe("");
    }
  });

  it("registers all eight image references in their original order as complete pages", () => {
    expect(dashboards.map((t) => t.name)).toEqual([
      "数字化运维服务管理系统", "电商销售实时大屏", "城市商圈可视化运营中心",
      "能源公司年度业绩看板", "深圳市医疗资源看板", "年度销售总结报表",
      "冰品业务进销存数据", "智慧工厂可视化大屏",
    ]);
    expect(SEED_TEMPLATES.slice(0, 8).map((t) => t.id)).toEqual(dashboards.map((t) => t.id));
    for (const t of dashboards) {
      expect(t.kind).toBe("page");
      expect(t.html).toContain('data-ui-kind="page"');
      expect(t.html).toContain("<svg");
      expect(t.html).toContain("<style>");
      expect(t.html).toContain("<h1>");
      expect(t.html).toContain("样例数据");
      expect(t.html).not.toMatch(/<script[^>]+src=|<iframe|<img[^>]+src=["']https?:/i);
      expect(t.data_description.length).toBeGreaterThan(50);
      expect(t.preview_width).toBeGreaterThan(1000);
    }
  });

  it("never uses the retired global sendPrompt('...') idiom", () => {
    // Inside the websandbox iframe there is no global sendPrompt — only the
    // RPC bridge. Seeds are handed to the model as style references, so a
    // legacy idiom here teaches the model to emit dead buttons.
    for (const t of SEED_TEMPLATES) {
      expect(t.html).not.toContain("sendPrompt('");
      expect(t.html).not.toContain('sendPrompt("');
    }
  });

  it("wires interactive buttons through the sandbox bridge", () => {
    const invoice = SEED_TEMPLATES.find((t) => t.id === "seed-invoice-001")!;
    expect(invoice.html).toContain("Websandbox.connection.remote.sendPrompt({ text:");
  });
});
