// Envelope transport utility. Percent-encoded bodies require an explicit decoder
// at the receiver; the CopilotKit runtime endpoint consumes ordinary JSON.
const AGENT_METHODS = new Set(["agent/run", "agent/connect", "transcribe"]);

function strictEncode(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
export function encodeEnvelope(rawBody: string): string | null {
  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (
    typeof envelope !== "object" ||
    envelope === null ||
    Array.isArray(envelope)
  ) {
    return null;
  }

  const { method, params, body } = envelope as {
    method?: unknown;
    params?: unknown;
    body?: unknown;
  };

  if (!AGENT_METHODS.has(String(method))) return null;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  return JSON.stringify({
    method,
    params,
    body: strictEncode(JSON.stringify(body)),
  });
}


