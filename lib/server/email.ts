import "server-only";

export async function sendEmail(message: { to: string; subject: string; text: string; id: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL;
  if (!key || !from) throw new Error("Email unavailable");
  const endpoint = new URL(process.env.RESEND_API_URL || "https://api.resend.com");
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname))) throw new Error("Email unavailable");
  const response = await fetch(new URL("/emails", endpoint), { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": message.id },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error("Email unavailable");
}
