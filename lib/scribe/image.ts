// An easel photo is fitted in the browser before it is sent: 2400 px on the long edge, JPEG,
// so a phone's 12 megapixel photo is a few hundred kilobytes over venue wifi.
export const photoEdge = 2400;
export const photoQuality = 0.82;
export async function fitPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, photoEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("No canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", photoQuality));
    if (!blob) throw new Error("Photo could not be fitted");
    return blob;
  } finally { bitmap.close(); }
}
