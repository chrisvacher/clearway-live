import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "quiet" | "danger" | "danger-solid";
type Size = "default" | "small";
type Appearance = {
  variant?: Variant;
  size?: Size;
} & ({ iconOnly: true; "aria-label": string } | { iconOnly?: false });

type NativeButton = ComponentProps<"button"> & { href?: undefined };
type LinkButton = Omit<ComponentProps<typeof Link>, "href"> & { href: string; disabled?: boolean };

function classes(variant: Variant = "secondary", size?: Size, iconOnly?: boolean, className?: string) {
  return cn("cwl-ui-button", `cwl-ui-button--${variant}`, size === "small" && "is-small", iconOnly && "is-icon", className);
}

export function Button(props: Appearance & (NativeButton | LinkButton)) {
  if (props.href !== undefined) {
    const { href, disabled, children, variant, size, iconOnly, className, ...linkProps } = props;
    const appearance = classes(variant, size, iconOnly, className);
    if (disabled) return <span className={appearance} aria-disabled="true" aria-label={linkProps["aria-label"]}>{children}</span>;
    return <Link {...linkProps} href={href} className={appearance}>{children}</Link>;
  }
  const { type = "button", variant, size, iconOnly, className, ...buttonProps } = props;
  return <button {...buttonProps} type={type} className={classes(variant, size, iconOnly, className)} />;
}
