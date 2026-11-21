"use client";
import { useEffect, useRef } from "react";
import { QuietSend } from "@/lib/phone/auto-send";

export function useAutoSend<T>(initial: T, deliver: (value: T) => void, open: boolean) {
  const latest = useRef({ deliver, open });
  latest.current = { deliver, open };
  const queue = useRef<QuietSend<T> | null>(null);
  if (!queue.current) queue.current = new QuietSend(initial, value => { if (latest.current.open) latest.current.deliver(value); });
  const signature = JSON.stringify(initial), external = useRef(initial);
  external.current = initial;
  useEffect(() => { queue.current?.acknowledge(external.current); }, [signature]);
  useEffect(() => { if (!open) queue.current?.cancel(); }, [open]);
  useEffect(() => () => queue.current?.cancel(), []);
  return queue.current;
}
