import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 天气数据源：sojson 免费天气接口（中国天气网 cityKey 体系）
 *
 *   http://t.weather.sojson.com/api/weather/city/{cityKey}
 *
 * cityKey 为 9 位城市编码，例如 101030100 = 天津市。
 * 该接口为 http（非 https），由本服务端代理转发，前端不直接访问。
 */
const SOJSON_BASE = "http://t.weather.sojson.com/api/weather/city/";
const DEFAULT_CITY_KEY = "101030100";
const UPSTREAM_TIMEOUT_MS = 10_000;
/** 上游每小时左右才更新一次，5 分钟缓存足以避免轮询打爆第三方。 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 城市名 → cityKey。
 *
 * 每一项都已用真实请求核对过返回的 cityInfo.city，请勿凭记忆增删：
 * 编码写错不会报错，只会静默返回另一个城市的天气。
 * 未收录的城市可直接把 9 位编码传给 ?city= 或 ?code=。
 */
const CITY_KEYS: Record<string, string> = {
  // 直辖市
  北京: "101010100",
  上海: "101020100",
  天津: "101030100",
  重庆: "101040100",
  // 东北 / 华北 / 西北
  哈尔滨: "101050101",
  长春: "101060101",
  沈阳: "101070101",
  大连: "101070201",
  呼和浩特: "101080101",
  石家庄: "101090101",
  唐山: "101090501",
  太原: "101100101",
  西安: "101110101",
  // 华东
  济南: "101120101",
  青岛: "101120201",
  烟台: "101120501",
  潍坊: "101120601",
  南京: "101190101",
  苏州: "101190401",
  无锡: "101190201",
  徐州: "101190801",
  南通: "101190501",
  扬州: "101190601",
  盐城: "101190701",
  杭州: "101210101",
  宁波: "101210401",
  温州: "101210701",
  嘉兴: "101210301",
  金华: "101210901",
  台州: "101210601",
  合肥: "101220101",
  福州: "101230101",
  厦门: "101230201",
  泉州: "101230501",
  南昌: "101240101",
  // 华中 / 华南
  郑州: "101180101",
  洛阳: "101180901",
  武汉: "101200101",
  长沙: "101250101",
  广州: "101280101",
  深圳: "101280601",
  珠海: "101280701",
  佛山: "101280800",
  东莞: "101281601",
  中山: "101281701",
  惠州: "101280301",
  汕头: "101280501",
  南宁: "101300101",
  桂林: "101300501",
  海口: "101310101",
  三亚: "101310201",
  // 西南
  成都: "101270101",
  贵阳: "101260101",
  昆明: "101290101",
  丽江: "101291401",
  兰州: "101160101",
  西宁: "101150101",
  银川: "101170101",
  乌鲁木齐: "101130101",
  拉萨: "101140101",
};

export type WeatherForecastDay = {
  /** 观测日期，YYYY-MM-DD */
  date: string;
  /** 星期，如「星期二」 */
  week: string;
  condition: string;
  tempMax: number;
  tempMin: number;
  windDirection: string;
  windScale: string;
  aqi: number | null;
};

export type WeatherPayload = {
  cityKey: string;
  /** 城市名，如「天津市」 */
  city: string;
  /** 上级行政区，如「广东」；直辖市与城市同名时省略 */
  province?: string;
  /** 本服务取数时刻（ISO） */
  updatedAt: string;
  /** 上游出报时刻，如「2026-09-22 15:07:04」 */
  reportedAt: string | null;
  /** true 表示本次命中本地缓存，未重新请求上游 */
  cached: boolean;
  current: {
    temperature: number;
    /** 相对湿度百分数，已剥离 % 符号 */
    humidity: number;
    /** 当前天气类型（取自今日预报，上游无独立实况字段） */
    condition: string;
    windDirection: string;
    windScale: string;
    /** 空气质量等级，如「优」 */
    quality: string;
    pm25: number | null;
    pm10: number | null;
  };
  forecast: WeatherForecastDay[];
  /** 感冒指数提示 */
  tip?: string;
};

type SojsonForecast = {
  date?: string;
  ymd?: string;
  week?: string;
  high?: string;
  low?: string;
  type?: string;
  fx?: string;
  fl?: string;
  aqi?: number | string | null;
};

type SojsonResponse = {
  status?: number;
  message?: string;
  date?: string;
  time?: string;
  cityInfo?: { city?: string; citykey?: string; parent?: string; updateTime?: string };
  data?: {
    wendu?: string;
    shidu?: string;
    pm25?: number | string | null;
    pm10?: number | string | null;
    quality?: string;
    ganmao?: string;
    forecast?: SojsonForecast[];
    yesterday?: SojsonForecast;
  };
};

/** 从「高温 29℃」这类文本里取出数值。 */
function parseTemp(value: unknown): number {
  const m = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** 从「45%」这类文本里取出数值。 */
function parsePercent(value: unknown): number {
  const m = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** 把用户输入解析为 9 位 cityKey：数字直传，城市名查表。 */
function resolveCityKey(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  if (/^\d{6,12}$/.test(input)) return input;

  const normalized = input
    .replace(/\s+/g, "")
    .replace(/(特别行政区|自治区|自治州|地区)$/, "")
    .replace(/[市省县区]$/, "");

  return CITY_KEYS[input] ?? CITY_KEYS[normalized] ?? null;
}

const cache = new Map<string, { at: number; payload: WeatherPayload }>();

function readCache(key: string): WeatherPayload | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { ...hit.payload, cached: true };
}

function toPayload(cityKey: string, raw: SojsonResponse): WeatherPayload | null {
  const data = raw.data;
  const forecastRaw = Array.isArray(data?.forecast) ? data!.forecast! : [];
  if (!data || forecastRaw.length === 0) return null;

  const today = forecastRaw[0];
  const city = str(raw.cityInfo?.city, cityKey);
  const parent = str(raw.cityInfo?.parent);

  const forecast: WeatherForecastDay[] = forecastRaw.slice(0, 5).map((day) => ({
    date: str(day.ymd, str(day.date)),
    week: str(day.week),
    condition: str(day.type, "未知"),
    tempMax: parseTemp(day.high),
    tempMin: parseTemp(day.low),
    windDirection: str(day.fx),
    windScale: str(day.fl),
    aqi: numOrNull(day.aqi),
  }));

  // 直辖市的 parent 与城市同名（北京 → 北京），显示时会重复，故省略。
  const province =
    parent && parent.replace(/[市]$/, "") !== city.replace(/[市]$/, "")
      ? parent
      : undefined;

  return {
    cityKey,
    city,
    province,
    updatedAt: new Date().toISOString(),
    reportedAt: str(raw.time) || null,
    cached: false,
    current: {
      temperature: numOrNull(data.wendu) ?? 0,
      humidity: parsePercent(data.shidu),
      condition: str(today.type, "未知"),
      windDirection: str(today.fx),
      windScale: str(today.fl),
      quality: str(data.quality, "—"),
      pm25: numOrNull(data.pm25),
      pm10: numOrNull(data.pm10),
    },
    forecast,
    tip: str(data.ganmao) || undefined,
  };
}

async function fetchSojson(cityKey: string): Promise<SojsonResponse> {
  const res = await fetch(SOJSON_BASE + cityKey, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`上游返回 HTTP ${res.status}`);
  }
  return (await res.json()) as SojsonResponse;
}

export async function GET(req: NextRequest) {
  const rawInput =
    req.nextUrl.searchParams.get("city") ||
    req.nextUrl.searchParams.get("code") ||
    "";

  const cityKey = rawInput.trim()
    ? resolveCityKey(rawInput)
    : DEFAULT_CITY_KEY;

  if (!cityKey) {
    return NextResponse.json(
      {
        error:
          `未收录的城市：${rawInput.trim()}。` +
          `可直接使用 9 位城市编码，例如 101030100（天津）、101010100（北京）。`,
      },
      { status: 404 }
    );
  }

  const cached = readCache(cityKey);
  if (cached) {
    return NextResponse.json(cached, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const upstream = await fetchSojson(cityKey);

    if (upstream.status !== 200) {
      return NextResponse.json(
        { error: `天气服务返回异常：${str(upstream.message, "未知错误")}` },
        { status: 502 }
      );
    }

    const payload = toPayload(cityKey, upstream);
    if (!payload) {
      return NextResponse.json(
        { error: `天气接口未返回城市 ${cityKey} 的数据` },
        { status: 502 }
      );
    }

    cache.set(cityKey, { at: Date.now(), payload });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/weather]", err);
    return NextResponse.json({ error: "获取天气失败" }, { status: 500 });
  }
}
