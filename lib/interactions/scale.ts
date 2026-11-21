// Pure scale geometry and aggregate statistics shared by TV, facilitator results and exports.
export type ScaleDot = { key: string; value: number };
export type NpsSummary = { score: number | null; low: number; middle: number; high: number };
export function npsSummary(values: readonly number[]): NpsSummary {
  const valid = values.filter(v => Number.isInteger(v) && v >= 1 && v <= 10);
  const low = valid.filter(v => v <= 6).length, middle = valid.filter(v => v === 7 || v === 8).length, high = valid.filter(v => v >= 9).length;
  return { score: valid.length ? (Math.sign(high - low) * Math.round(100 * Math.abs(high - low) / valid.length)) || 0 : null, low, middle, high };
}
export const signedScore = (score: number) => score > 0 ? `+${score}` : String(score);
export function scaleDotLayout(dots: readonly ScaleDot[], max: number, width: number, height: number, floor = 36, bands = false) {
  const top = bands ? 90 : 0, room = Math.max(0, height - top - 24);
  const stacks = Array.from({ length: max }, () => [] as ScaleDot[]);
  dots.forEach(dot => { if (Number.isInteger(dot.value) && dot.value >= 1 && dot.value <= max) stacks[dot.value - 1].push(dot); });
  // Stable order means a changed answer keeps its identity and slides into its new stack.
  stacks.forEach(stack => stack.sort((a, b) => a.key.localeCompare(b.key)));
  const tallest = Math.max(1, ...stacks.map(s => s.length));
  const diameter = Math.min(bands ? 64 : 76, (room - Math.max(0, tallest - 1) * 14) / tallest, width / Math.max(1, max - 1) - 14);
  const columns = diameter < floor;
  const size = Math.max(floor, diameter);
  return { columns, size, positions: stacks.flatMap((stack, index) => stack.map((dot, level) => ({ ...dot,
    x: index * width / Math.max(1, max - 1), y: height - 24 - size / 2 - level * (size + 14) }))) };
}
