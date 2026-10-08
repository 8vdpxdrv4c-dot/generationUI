import { act, render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { WeatherCard } from "../weather-card";

/**
 * 数据源为 sojson（中国天气网 cityKey）。这里的 payload 结构必须与
 * apps/app/src/app/api/weather/route.ts 的 WeatherPayload 保持一致。
 */
const payload = {
  cityKey: "101030100",
  city: "天津市",
  updatedAt: "2026-09-22T07:40:00.000Z",
  reportedAt: "2026-09-22 15:07:04",
  cached: false,
  current: {
    temperature: 29.7,
    humidity: 45,
    condition: "晴",
    windDirection: "西南风",
    windScale: "1级",
    quality: "优",
    pm25: 20,
    pm10: 34,
  },
  forecast: [
    { date: "2026-09-22", week: "星期二", condition: "晴", tempMax: 29, tempMin: 19, windDirection: "西南风", windScale: "1级", aqi: 72 },
    { date: "2026-09-23", week: "星期三", condition: "晴", tempMax: 30, tempMin: 20, windDirection: "西南风", windScale: "1级", aqi: 63 },
    { date: "2026-09-24", week: "星期四", condition: "多云", tempMax: 26, tempMin: 21, windDirection: "东风", windScale: "2级", aqi: 57 },
    { date: "2026-09-25", week: "星期五", condition: "多云", tempMax: 27, tempMin: 21, windDirection: "东南风", windScale: "1级", aqi: 50 },
    { date: "2026-09-26", week: "星期六", condition: "多云", tempMax: 28, tempMin: 20, windDirection: "南风", windScale: "1级", aqi: 54 },
  ],
  tip: "各类人群可自由活动",
};

function stubFetch(body: unknown, ok = true, status = 200) {
  // 显式声明参数类型，否则 mock.calls 被推断为空元组，无法读取 calls[0][0]
  const fn = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok,
      status,
      json: async () => body,
    })
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** 折叠状态的判定不靠文案，而靠「可访问性契约」：按钮的 aria-expanded + 面板的 aria-hidden */
function forecastToggle() {
  return screen.getByRole("button", { name: /未来 5 天/ });
}

function forecastPanel(): HTMLElement {
  const id = forecastToggle().getAttribute("aria-controls");
  const el = id ? document.getElementById(id) : null;
  if (!el) throw new Error("forecast panel not found via aria-controls");
  return el;
}

/** 卡片根节点＝容器的第一个元素，点击它等于「点击卡片」 */
function cardOf(container: HTMLElement): HTMLElement {
  const el = container.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error("card root not found");
  return el;
}

describe("WeatherCard (sojson contract)", () => {
  it("polls Beijing every five seconds, visibly updates checks, and aborts after unmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
    const fetcher = stubFetch({ ...payload, city: "北京市", cityKey: "101010100" });
    try {
      let view!: ReturnType<typeof render>;
      await act(async () => { view = render(<WeatherCard city="北京" refreshIntervalMs={5000} />); });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(fetcher.mock.calls[0][0])).toBe(`/api/weather?city=${encodeURIComponent("北京")}`);
      const firstCheck = screen.getByText(/最近检查/).textContent;
      await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
      expect(fetcher).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/最近检查/).textContent).not.toBe(firstCheck);
      const signal = fetcher.mock.calls[1][1]?.signal;
      view.unmount();
      expect(signal?.aborted).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests /api/weather with the city argument", async () => {
    const spy = stubFetch(payload);
    render(<WeatherCard city="天津" />);

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain("/api/weather?city=");
    expect(url).toContain(encodeURIComponent("天津"));
  });

  it("renders current conditions from the new fields", async () => {
    stubFetch(payload);
    render(<WeatherCard city="101030100" />);

    expect(await screen.findByText("天津市")).toBeDefined();
    expect(screen.getByText("30°C")).toBeDefined();      // 29.7 四舍五入
    expect(screen.getByText("45%")).toBeDefined();       // shidu 的 % 已剥离
    expect(screen.getByText("西南风 1级")).toBeDefined();
    expect(screen.getByText("优·20")).toBeDefined();      // quality + pm25
    expect(screen.getByText("各类人群可自由活动")).toBeDefined();
    expect(
      screen.getByText(/实况 09-22 15:07/)
    ).toBeDefined();
  });

  it("renders 5 forecast days using the upstream 星期 value", async () => {
    stubFetch(payload);
    const { container } = render(<WeatherCard city="天津" />);

    expect(await screen.findByText("未来 5 天")).toBeDefined();
    // 预报默认收起，需先展开
    fireEvent.click(cardOf(container));

    for (const d of payload.forecast) {
      const short = d.week.replace("星期", "周");
      expect(screen.getByText(short), `missing ${short}`).toBeDefined();
    }
    expect(screen.getByText("26°")).toBeDefined();
    // 21° 同时是 9-24 与 9-25 的最低温，故用 AllBy 断言出现次数
    expect(screen.getAllByText("21°")).toHaveLength(2);
  });

  it("hides the province label for municipalities", async () => {
    stubFetch(payload);
    render(<WeatherCard city="天津" />);
    await screen.findByText("天津市");
    // 天津的 parent 就是「天津」，重复显示没有意义
    expect(screen.queryByText("天津", { exact: true })).toBeNull();
  });

  it("shows the province label when it differs from the city", async () => {
    stubFetch({ ...payload, city: "深圳市", cityKey: "101280601", province: "广东" });
    render(<WeatherCard city="深圳" />);
    await screen.findByText("深圳市");
    expect(screen.getByText("广东")).toBeDefined();
  });

  it("surfaces the API error message for an unknown city", async () => {
    stubFetch(
      { error: "未收录的城市：火星。可直接使用 9 位城市编码，例如 101030100（天津）。" },
      false,
      404
    );
    render(<WeatherCard city="火星" />);

    expect(
      await screen.findByText(/未收录的城市：火星/)
    ).toBeDefined();
  });

  it("does not require the removed uvIndex field", async () => {
    const withoutExtras = {
      ...payload,
      current: { ...payload.current, pm25: null, pm10: null },
    };
    stubFetch(withoutExtras);
    render(<WeatherCard city="天津" />);

    expect(await screen.findByText("天津市")).toBeDefined();
    expect(screen.queryByText(/紫外线/)).toBeNull();
  });

  it("collapses the 5-day forecast by default", async () => {
    stubFetch(payload);
    render(<WeatherCard city="天津" />);
    await screen.findByText("天津市");

    const toggle = forecastToggle();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("点击展开");
    // 面板留在 DOM 内（折叠靠 grid-template-rows 动画），但从可访问性树中移除
    expect(forecastPanel().getAttribute("aria-hidden")).toBe("true");
  });

  it("expands the forecast when the card is clicked, and collapses on a second click", async () => {
    stubFetch(payload);
    const { container } = render(<WeatherCard city="天津" />);
    await screen.findByText("天津市");

    const card = cardOf(container);

    fireEvent.click(card);
    expect(forecastToggle().getAttribute("aria-expanded")).toBe("true");
    expect(forecastToggle().textContent).toContain("点击收起");
    expect(forecastPanel().getAttribute("aria-hidden")).toBe("false");

    fireEvent.click(card);
    expect(forecastToggle().getAttribute("aria-expanded")).toBe("false");
    expect(forecastPanel().getAttribute("aria-hidden")).toBe("true");
  });

  it("toggles once (not twice) when the 未来 5 天 row itself is clicked", async () => {
    stubFetch(payload);
    render(<WeatherCard city="天津" />);
    await screen.findByText("天津市");

    // 该行是按钮，卡片根节点也绑了同一个 handler；若 stopPropagation 失效会被切两次
    fireEvent.click(forecastToggle());
    expect(forecastToggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the expansion state across a polling refresh", async () => {
    vi.useFakeTimers();
    try {
      stubFetch(payload);
      const { container } = render(<WeatherCard city="天津" refreshIntervalMs={5000} />);
      await vi.waitFor(() => expect(screen.getByText("天津市")).toBeDefined());

      fireEvent.click(cardOf(container));
      expect(forecastToggle().getAttribute("aria-expanded")).toBe("true");

      await vi.advanceTimersByTimeAsync(5000);
      // 5 秒轮询重渲染后仍保持展开
      expect(forecastToggle().getAttribute("aria-expanded")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the default city when the LLM omits the argument", async () => {
    const spy = stubFetch(payload);
    // 模拟 LLM 漏传必填参数：不应抛错，应回退到默认城市
    render(<WeatherCard city={undefined as unknown as string} />);

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(String(spy.mock.calls[0][0])).toContain("101030100");
  });

  it("falls back to the default interval for a non-numeric refreshIntervalMs", async () => {
    const spy = stubFetch(payload);
    render(
      <WeatherCard city="天津" refreshIntervalMs={"abc" as unknown as number} />
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(await screen.findByText(/每 5 秒刷新/)).toBeDefined();
  });
});
