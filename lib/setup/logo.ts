// Church logo uploads: one small PNG, JPEG or WebP, judged by its bytes and never by its name.
export const logoBucket = "church-logos";
export const logoMaxBytes = 1048576;
export type LogoKind = { ext: "png" | "jpg" | "webp"; type: "image/png" | "image/jpeg" | "image/webp" };
export function logoKind(bytes: Uint8Array): LogoKind | null {
  const at = (i: number, ...v: number[]) => v.every((b, k) => bytes[i + k] === b);
  if (bytes.length > 12 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", type: "image/png" };
  if (bytes.length > 12 && at(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", type: "image/jpeg" };
  if (bytes.length > 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { ext: "webp", type: "image/webp" };
  return null;
}
export const logoPath = (church: string, token: string, kind: LogoKind) => `${church}/${token}.${kind.ext}`;
