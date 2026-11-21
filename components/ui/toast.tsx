"use client";

import { Check, Undo2 } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastAction = { label: string; icon?: ReactNode } & ({ href: string } | { onClick: () => void | Promise<void> });
type ToastOptions = { duration?: number; action?: ToastAction; icon?: ReactNode };
type AddToast = (message: string, options?: ToastOptions) => void;
type ToastRecord = ToastOptions & { id: number; message: string };

const ToastContext = createContext<AddToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const remove = useCallback((id: number) => setItems(items => items.filter(item => item.id !== id)), []);
  const add = useCallback<AddToast>((message, options) => {
    const id = ++nextId.current;
    setItems(items => [...items, { id, message, ...options }]);
  }, []);

  return <ToastContext.Provider value={add}>
    {children}
    <div data-surface="setup" className="cwl-ui-toast-surface">
      <div className="cwl-ui-toast-stack">{items.map(item => <Toast key={item.id} item={item} remove={remove} />)}</div>
    </div>
  </ToastContext.Provider>;
}

function Toast({ item, remove }: { item: ToastRecord; remove: (id: number) => void }) {
  const { action } = item;
  const element = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState(false);
  const remaining = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (hover || focus || running) return;
    if (remaining.current === undefined && element.current) {
      remaining.current = item.duration ?? (Number.parseFloat(getComputedStyle(element.current).getPropertyValue("--cwl-dur-toast-hold")) || 5000);
    }
    const start = performance.now();
    const timeout = setTimeout(() => remove(item.id), remaining.current);
    return () => {
      clearTimeout(timeout);
      remaining.current = Math.max(0, (remaining.current ?? 5000) - (performance.now() - start));
    };
  }, [focus, hover, item.id, item.duration, remove, running]);

  return <div ref={element} className="cwl-ui-toast" role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    onFocus={() => setFocus(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); }}>
    {item.icon ?? <Check size={16} aria-hidden="true" />}
    <span>{failure ? "Could not complete that action. Try again." : item.message}</span>
    {action && ("href" in action ? <Link href={action.href} onClick={() => remove(item.id)}>{action.icon}{action.label}</Link> : <button type="button" disabled={running} onClick={async () => {
      setRunning(true);
      try {
        await action.onClick();
        remove(item.id);
      } catch {
        setFailure(true);
        setRunning(false);
      }
    }}>{action.icon ?? <Undo2 size={14} aria-hidden="true" />}{action.label}</button>)}
  </div>;
}
