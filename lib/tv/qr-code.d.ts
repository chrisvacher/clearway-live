type Qr = { addData(value: string): void; make(): void; getModuleCount(): number; isDark(row: number, column: number): boolean };
export default function qrcode(type: number, correction: "M" | "L" | "Q" | "H"): Qr;
