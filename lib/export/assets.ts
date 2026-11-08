// The files the documents need, read from disk at the project root. next.config.ts lists them in outputFileTracingIncludes for the export route,
// so they are copied into the Vercel function. The fonts are the full Plus Jakarta Sans files the design system ships in design/clearway-base/fonts (SIL Open Font License, OFL.txt beside them), so every Latin Extended letter in a name draws.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = () => process.cwd();
export const logoPath = () => join(root(), "lib/export/assets/clearway-logo-dark.png");
export const fontFile = (weight: 400 | 700, style: "normal" | "italic" = "normal") => join(root(), `design/clearway-base/fonts/PlusJakartaSans-${weight === 700 ? "Bold" : ""}${weight === 400 && style === "normal" ? "Regular" : ""}${style === "italic" ? "Italic" : ""}.ttf`);
export const logoPng = () => readFileSync(logoPath());
// The logo is 640 x 139. Widths here are what each place draws it at, keeping that ratio.
export const logoSize = (width: number) => ({ width, height: Math.round(width * 139 / 640) });
