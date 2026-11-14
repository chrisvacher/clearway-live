"use client";
import { createContext, useContext, type ReactNode } from "react";

// The signed-in facilitator, for the sidebar's profile and Sign out. Set once by the protected layout.
export type ShellFacilitator = { name: string; email: string };

const FacilitatorContext = createContext<ShellFacilitator | null>(null);

export function FacilitatorProvider({ facilitator, children }: { facilitator: ShellFacilitator; children: ReactNode }) {
  return <FacilitatorContext.Provider value={facilitator}>{children}</FacilitatorContext.Provider>;
}

export const useFacilitator = () => useContext(FacilitatorContext);
