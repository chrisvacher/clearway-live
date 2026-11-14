import "server-only";
import type { Skin } from "../brand";
import { sender } from "../email/sender";

export async function sendEmail(message: { to: string; subject: string; text: string; html?: string; id: string; skin?: Skin }) {
  const key = process.env.RESEND_API_KEY, as = sender(message.skin), from = as?.from;
  if (!key || !from) throw new Error("Email unavailable");
  const endpoint = new URL(process.env.RESEND_API_URL || "https://api.resend.com");
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname))) throw new Error("Email unavailable");
  const response = await fetch(new URL("/emails", endpoint), { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": message.id },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}), ...(as?.replyTo ? { reply_to: as.replyTo } : {}) }),
  });
  if (!response.ok) throw new Error("Email unavailable");
}

export async function sendEmailBatch(id:string,messages:{to:string;subject:string;text:string}[],skin?:Skin) {
  const key=process.env.RESEND_API_KEY,as=sender(skin),from=as?.from;
  if(!key||!from||messages.length<1||messages.length>50)throw new Error("Email unavailable");
  const endpoint=new URL(process.env.RESEND_API_URL||"https://api.resend.com");
  if(endpoint.protocol!=="https:" && !(endpoint.protocol==="http:" && ["localhost","127.0.0.1"].includes(endpoint.hostname)))throw new Error("Email unavailable");
  const response=await fetch(new URL("/emails/batch",endpoint),{method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify(messages.map(m=>({...m,from,...(as?.replyTo?{reply_to:as.replyTo}:{}),to:[m.to]})))});
  if(!response.ok)throw new Error("Email unavailable");
  const result=await response.json();if(!Array.isArray(result.data)||result.data.length!==messages.length)throw new Error("Email unavailable");
}
