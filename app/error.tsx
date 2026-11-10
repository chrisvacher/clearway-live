"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/operations/client";
export default function ScreenUnavailable({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void reportClientError(error, "boundary"); }, [error]);
  return <main id="main" className="page-width narrow"><h1>We couldn’t open this screen</h1><p>Try opening the screen again.</p><button type="button" className="button-link" onClick={reset}>Try again</button></main>;
}
