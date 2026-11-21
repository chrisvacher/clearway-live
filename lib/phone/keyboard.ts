// A fine pointer is the browser's indication of a laptop/desktop input device.
// Composition must finish before Enter may send an answer.
export function sendsWithEnter(key: string, shift: boolean, composing: boolean, finePointer: boolean, laptop: boolean, kind: string): boolean {
  if (key !== "Enter" || shift || composing) return false;
  return laptop ? finePointer : kind !== "wall";
}
