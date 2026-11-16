// Maps a pointer position to the signature field's own units (its viewBox, 600 by 200), the units
// strokes are stored and sent in. The rect is the svg's getBoundingClientRect(), which already
// includes any CSS transform scale on an ancestor (the TV stage, a scaled phone frame) and is in
// the same CSS pixels as clientX/clientY, so page scroll and devicePixelRatio drop out.
// The svg draws with the default preserveAspectRatio (xMidYMid meet): one uniform scale, the
// smaller of the two, and the spare space split evenly on both sides. Dividing x by width and
// y by height on their own goes wrong as soon as the box is not exactly 3 by 1, which on a
// wide laptop window puts the ink well away from the cursor.
export type PointRect = { left: number; top: number; width: number; height: number };

export function pointInViewBox(clientX: number, clientY: number, rect: PointRect, viewWidth: number, viewHeight: number): [number, number] {
  const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight);
  if (!(scale > 0) || !Number.isFinite(scale)) return [0, 0];
  const padX = (rect.width - viewWidth * scale) / 2, padY = (rect.height - viewHeight * scale) / 2;
  return [(clientX - rect.left - padX) / scale, (clientY - rect.top - padY) / scale];
}
