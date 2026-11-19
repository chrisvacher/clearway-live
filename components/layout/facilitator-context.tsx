"use client";
import type { ShellData } from "./shell-nav";
import { createContext, useContext, type ReactNode } from "react";

// The signed-in facilitator, for the sidebar's profile and Sign out. Set once by the protected layout.
export type ShellFacilitator = { name: string; email: string };

const FacilitatorContext = createContext<ShellFacilitator | null>(null);

export function FacilitatorProvider({ facilitator, children }: { facilitator: ShellFacilitator; children: ReactNode }) {
  return <FacilitatorContext.Provider value={facilitator}>{children}</FacilitatorContext.Provider>;
}

export const useFacilitator = () => useContext(FacilitatorContext);

export type SidebarChoice = "expanded" | "collapsed" | null;
export const ShellNavigationContext = createContext<{
  data: ShellData;
  openJump: () => void;
  preference: SidebarChoice;
  toggleSidebar: (collapsed: boolean) => void;
} | null>(null);
export const useShellNavigation = () => useContext(ShellNavigationContext);

export function localRead(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function localWrite(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
}
