import mock from "@/data/pue.mock.json";
import { PUE_REFRESH_MS, PuePayloadSchema } from "@/lib/pue";

export const dynamic = "force-dynamic";

export function GET() {
  const now = Date.now();
  // All clients see the same sample during each five-second window.
  const index = Math.floor(now / PUE_REFRESH_MS) % mock.values.length;
  const payload = PuePayloadSchema.parse({
    pue: mock.values[index],
    updatedAt: new Date(Math.floor(now / PUE_REFRESH_MS) * PUE_REFRESH_MS).toISOString(),
    source: "mock",
  });
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
