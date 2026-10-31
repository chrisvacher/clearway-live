"use client";
import { Printer } from "lucide-react";
export function PrintButton() {
  return <button className="show-button is-primary" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Print run of show</button>;
}
