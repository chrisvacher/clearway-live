import assert from "node:assert/strict";
import { test } from "node:test";
import { resumableVideoEndpoint, videoLimit, videoUploadRequest } from "../../lib/video/files";
import { linkedVideo, mediaPosition, videoOptions, videoTime } from "../../lib/video/playback";

const id = "01b18cdb-3923-4da2-a5bf-f3f6e208a01e";
const upload = { action: "begin", id, engagement: id, name: "Clip.mp4", mime: "video/mp4", bytes: videoLimit };

test("the video upload contract accepts MP4 and MOV up to 500 MiB", () => {
  assert.equal(videoUploadRequest(upload)?.action, "begin");
  assert.equal(videoUploadRequest({ ...upload, mime: "video/quicktime", bytes: 1 })?.action, "begin");
  for (const bytes of [0, 3.5, videoLimit + 1, "1000"]) assert.equal(videoUploadRequest({ ...upload, bytes }), null);
  assert.equal(videoUploadRequest({ ...upload, mime: "audio/mpeg" }), null);
  assert.equal(videoUploadRequest({ ...upload, action: "finish", width: 1920, height: 1080, duration: 32 })?.action, "finish");
  assert.equal(videoUploadRequest({ ...upload, action: "finish", width: 1920, height: 1080, duration: "32" }), null);
  assert.equal(resumableVideoEndpoint("https://example.supabase.co"), "https://example.storage.supabase.co/storage/v1/upload/resumable");
});

test("linked clips use YouTube and Vimeo video identifiers", () => {
  const youtube = { provider: "youtube", id: "dQw4w9WgXcQ" };
  for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?list=1&v=dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) assert.deepEqual(linkedVideo(url), youtube);
  assert.deepEqual(linkedVideo("https://player.vimeo.com/video/12000?h=123abcdef"), { provider: "vimeo", id: "12000", hash: "123abcdef" });
  for (const url of ["https://vimeo.com/12000/untrusted", "https://youtube.com.other.test/watch?v=dQw4w9WgXcQ", "http://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=wrong"]) assert.equal(linkedVideo(url), null);
});

test("a reconnect derives the current position from the server clock and clamps to the end", () => {
  const at = "2026-11-21T19:00:00.000Z";
  const state = { session: id, playing: true, position: 2, at };
  assert.equal(mediaPosition(state, Date.parse(at) + 4000), 6);
  assert.equal(mediaPosition(state, Date.parse(at) + 4000, 5), 5);
  assert.equal(mediaPosition({ ...state, playing: false }, Date.parse(at) + 4000), 2);
  assert.equal(videoTime(125), "2:05");
  assert.deepEqual(videoOptions({ video: { source: "upload", id } }), { source: "upload", id, start: 0, end: null, ends: "hold", sound: true });
});
