"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/operations/client";
import "./globals.css";
export default function AppUnavailable({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void reportClientError(error, "boundary"); }, [error]);
  return <html lang="en"><body><main id="main" className="page-width narrow"><h1>We couldn’t open this screen</h1><p>Try opening it again.</p><button type="button" onClick={reset}>Try again</button></main></body></html>;
}
