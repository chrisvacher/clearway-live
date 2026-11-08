"use client";
import { Printer } from "lucide-react";

// The one control on the public page. It prints or saves the page and changes nothing.
export function PrintButton() {
  return <button type="button" className="ro-print" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print or save as PDF</button>;
}
