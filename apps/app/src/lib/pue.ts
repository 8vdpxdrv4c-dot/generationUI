import { z } from "zod";

export const PuePayloadSchema = z.object({
  pue: z.number().finite().min(0).max(2),
  updatedAt: z.string().datetime(),
  source: z.enum(["mock", "live"]),
});

export type PuePayload = z.infer<typeof PuePayloadSchema>;
export const PUE_REFRESH_MS = 5000;

// 270-degree arc: 0 at bottom-left, 1 at top, 2 at bottom-right.
export function pueAngle(value: number): number {
  return -135 + (Math.min(2, Math.max(0, value)) / 2) * 270;
}
