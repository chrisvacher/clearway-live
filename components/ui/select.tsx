import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";

// The one select on the setup pages: a native select drawn without the browser's arrow, with the design system's chevron (AppFields: .cwl-select).
export function Select({ children, className, ...props }: ComponentProps<"select">) {
  return <span className="cwl-select"><select className={className} {...props}>{children}</select><ChevronDown size={16} aria-hidden="true" /></span>;
}
