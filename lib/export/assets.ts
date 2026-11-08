// The files the documents need, read from disk at the project root. next.config.ts lists them in outputFileTracingIncludes for the export route,
// so they are copied into the Vercel function. The woff files are Plus Jakarta Sans from @fontsource (SIL Open Font License).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = () => process.cwd();
export const logoPath = () => join(root(), "lib/export/assets/clearway-logo-dark.png");
export const fontFile = (weight: 400 | 700, style: "normal" | "italic" = "normal") => join(root(), `node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-${weight}-${style}.woff`);
export const logoPng = () => readFileSync(logoPath());
// The logo is 640 x 139. Widths here are what each place draws it at, keeping that ratio.
export const logoSize = (width: number) => ({ width, height: Math.round(width * 139 / 640) });
