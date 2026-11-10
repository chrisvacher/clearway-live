import type { Instrumentation } from "next";
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordServerError } = await import("./lib/operations/server");
    await recordServerError(error, context.routePath || request.path);
  } catch { console.error("Operational error capture unavailable"); }
};
