// Refreshes the front page's app screenshots (public/home/) from the Riverside team workshop
// run in CI. Usage:
//   npm run home:shots -- <folder>     a folder holding the team-workshop-screens artifact
//   npm run home:shots -- --latest     download the newest artifact from main with gh first
// TV shots become 1600 wide WebP, phone shots keep their size. The room
// photos in public/home/ are left alone. See docs/front-page.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

// Each front page image and the workshop screenshot it comes from.
export const homeShots: Record<string, string> = {
  "tv-word-cloud": "team-05-word-cloud-tv", "phone-word-cloud": "team-05-word-cloud-phone",
  "tv-wall": "team-06-wall-summary-tv", "phone-wall": "team-06-wall-phone",
  "tv-points": "team-07-points-tv", "phone-points": "team-07-points-phone",
  "tv-grid": "team-08-grid-tv", "phone-grid": "team-08-grid-phone",
  "tv-qa": "team-09-qa-tv", "phone-qa": "team-09-qa-phone",
  "tv-sign": "team-10-sign-tv", "phone-sign": "team-10-sign-phone",
  "tv-prayer": "team-03-prayer-tv", "phone-prayer": "team-03-prayer-phone",
};

async function main() {
  let from = process.argv[2];
  assert.ok(from, "Give the artifact folder, or --latest");
  if (from === "--latest") {
    from = mkdtempSync(join(tmpdir(), "team-workshop-screens-"));
    const run = execFileSync("gh", ["run", "list", "--workflow", "CI", "--branch", "main", "--status", "success", "--limit", "1", "--json", "databaseId", "-q", ".[0].databaseId"], { encoding: "utf8" }).trim();
    assert.ok(run, "No successful CI run on main to take screens from");
    execFileSync("gh", ["run", "download", run, "--name", "team-workshop-screens", "--dir", from], { stdio: "inherit" });
  }
  const missing = Object.values(homeShots).filter(name => !existsSync(join(from, `${name}.png`)));
  assert.deepEqual(missing, [], `Missing from ${from}: ${missing.join(", ")}`);
  for (const [out, name] of Object.entries(homeShots)) {
    const image = sharp(join(from, `${name}.png`));
    await (out.startsWith("tv-") ? image.resize({ width: 1600 }) : image).webp({ quality: 82 }).toFile(join("public", "home", `${out}.webp`));
    console.log(`public/home/${out}.webp <- ${name}.png`);
  }
}

main().catch(error => { console.error(error.message); process.exit(1); });
