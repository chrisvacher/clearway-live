// JSON is streamed so larger engagement records can download without a single
// buffered HTTP response. The SQL RPC supplies one consistent database snapshot.
export function archiveStream(archive: unknown): ReadableStream<Uint8Array> {
  const text = JSON.stringify(archive, null, 2) + "\n";
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= text.length) { controller.close(); return; }
      let end = Math.min(offset + 32768, text.length);
      // Never split an emoji's surrogate pair across two encoder calls.
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      controller.enqueue(encoder.encode(text.slice(offset, end)));
      offset = end;
    },
  });
}

export const archiveName = (id: string) => `clearway-engagement-${id}.json`;
