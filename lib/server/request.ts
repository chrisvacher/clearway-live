import "server-only";

export async function limitedJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!request.body || Number(request.headers.get("content-length") || 0) > maxBytes) throw new Error("Invalid request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error("Invalid request"); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid request");
  return parsed as Record<string, unknown>;
}
