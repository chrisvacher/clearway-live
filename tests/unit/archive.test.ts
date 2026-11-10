import assert from "node:assert/strict";
import test from "node:test";
import { archiveName, archiveStream } from "../../lib/export/archive";

test("an archive round-trips records, Unicode and large notes across stream chunks", async () => {
  const original = { format: "clearway.engagement", version: 1, records: { notes: [
    { text: "a".repeat(32760) + "🌱".repeat(20000), quote: 'A participant said "yes".\nNext line.' },
  ] } };
  const response = new Response(archiveStream(original));
  assert.deepEqual(await response.json(), original);
});

test("the archive is downloaded under a stable engagement-specific JSON filename", () => {
  assert.equal(archiveName("90000000-0000-4000-8000-000000000010"), "clearway-engagement-90000000-0000-4000-8000-000000000010.json");
});
