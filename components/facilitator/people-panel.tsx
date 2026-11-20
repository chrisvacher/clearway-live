"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function PeoplePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Dialog open label={title} onClose={onClose} className="people-panel">
    <header><h2>{title}</h2><Button variant="quiet" iconOnly aria-label="Close panel" onClick={onClose} data-initial-focus><X aria-hidden="true" /></Button></header>
    {children}
  </Dialog>;
}
