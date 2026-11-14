import qrcode from "./qr-code";
import { shortRoomLink } from "./policy";
import type { Skin } from "../brand";
export function roomQr(code: string, skin: Skin = "clearway") { return linkQr(shortRoomLink(code, skin)); }
// The same drawing for any link, such as the phone remote's.
export function linkQr(link: string) {
  const qr = qrcode(0, "M"); qr.addData(link); qr.make();
  const size = qr.getModuleCount(); const cells: string[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  return { size: size + 8, path: cells.join("") };
}
