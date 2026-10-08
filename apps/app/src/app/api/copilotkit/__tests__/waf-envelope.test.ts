import { describe, expect, it } from "vitest";
import { encodeEnvelope } from "@/lib/copilotkit-envelope";

/** The signatures our ingress WAF blocks on, verified against production. */
const WAF_SIGNATURES = [
  "<script",
  "</script",
  "alert(",
  "eval(",
  "onerror=",
  "union select",
  "javascript:",
];

/** A payload shaped like what an agent run actually carries. */
const RUN_ENVELOPE = {
  method: "agent/run",
  params: { agentId: "default" },
  body: {
    threadId: "t-1",
    runId: "r-1",
    state: {},
    messages: [
      {
        id: "m-1",
        role: "user",
        content: "画一个太阳系，用 <script> 标签引入依赖",
      },
      {
        id: "m-2",
        role: "assistant",
        content:
          '<!DOCTYPE html><html><head><script>document.body.onerror=alert(1)</script>' +
          '</head><body><canvas id="c"></canvas></body></html>',
      },
    ],
    tools: [{ name: "create_chart", parameters: { code: 'eval("1+1") UNION SELECT 1' } }],
    forwardedProps: { note: "javascript:void(0)" },
  },
};

function decode(encoded: string) {
  return JSON.parse(encoded) as { method: string; params: unknown; body: string };
}

describe("encodeEnvelope", () => {
  it("strips every WAF signature from the wire format", () => {
    const encoded = encodeEnvelope(JSON.stringify(RUN_ENVELOPE));
    expect(encoded).not.toBeNull();

    const lowered = encoded!.toLowerCase();
    for (const signature of WAF_SIGNATURES) {
      expect(lowered).not.toContain(signature);
    }
  });

  it("escapes parentheses, which the WAF also matches on", () => {
    const encoded = encodeEnvelope(
      JSON.stringify({ method: "agent/run", body: { messages: [{ content: "alert(1)" }] } }),
    )!.toLowerCase();
    expect(encoded).not.toContain("(");
    expect(encoded).not.toContain(")");
  });

  it("round-trips the payload the runtime will reconstruct", () => {
    const encoded = encodeEnvelope(JSON.stringify(RUN_ENVELOPE));
    const envelope = decode(encoded!);

    expect(envelope.method).toBe("agent/run");
    expect(envelope.params).toEqual(RUN_ENVELOPE.params);
    expect(JSON.parse(decodeURIComponent(envelope.body))).toEqual(RUN_ENVELOPE.body);
  });

  it("keeps the wire format free of raw payload text", () => {
    // The container must be pure percent-encoding — no URL-safe leftovers.
    const envelope = decode(encodeEnvelope(JSON.stringify(RUN_ENVELOPE))!);
    expect(envelope.body).toMatch(/^[A-Za-z0-9%._~!*'()-]*$/);
    expect(envelope.body).not.toContain("<");
    expect(envelope.body).not.toContain('"');
  });

  it("leaves envelopes it cannot rewrite alone", () => {
    // Malformed JSON.
    expect(encodeEnvelope("not json")).toBeNull();
    // Not an envelope we own.
    expect(encodeEnvelope(JSON.stringify({ method: "info" }))).toBeNull();
    // `body` is a JSON string — the runtime accepts that, so re-encoding would
    // silently change its type.
    expect(
      encodeEnvelope(JSON.stringify({ method: "agent/run", params: {}, body: "raw" })),
    ).toBeNull();
    // `body` is an array.
    expect(
      encodeEnvelope(JSON.stringify({ method: "agent/run", params: {}, body: [1] })),
    ).toBeNull();
    // Missing method.
    expect(encodeEnvelope(JSON.stringify({ params: {}, body: {} }))).toBeNull();
  });

  it("does not corrupt payloads that contain a percent sign", () => {
    const body = { messages: [{ id: "1", role: "user", content: "宽度 100% 的图表" }] };
    const encoded = encodeEnvelope(JSON.stringify({ method: "agent/run", body }));
    expect(JSON.parse(decodeURIComponent(decode(encoded!).body))).toEqual(body);
  });
});

