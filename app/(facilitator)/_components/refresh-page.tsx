"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function RefreshPage({ label }: { label: string }) {
  const router=useRouter(), [pending,startTransition]=useTransition();
  return <button className="admin-button" type="button" disabled={pending} aria-busy={pending} onClick={()=>startTransition(()=>router.refresh())}>{pending?"Refreshing…":label}</button>;
}
