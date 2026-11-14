import qrcode from "./qr-code";
import { shortRoomLink } from "./policy";
import type { Skin } from "../brand";
export function roomQr(code: string, skin: Skin = "clearway") {
  const qr = qrcode(0, "M"); qr.addData(shortRoomLink(code, skin)); qr.make();
  const size = qr.getModuleCount(); const cells: string[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) cells.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  return { size: size + 8, path: cells.join("") };
}
