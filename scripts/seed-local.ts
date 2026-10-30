import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const output=execFileSync("supabase",["status","-o","env"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
const match=output.match(/^DB_URL="(.*)"$/m);assert.ok(match);assert.equal(new URL(match[1]).hostname,"127.0.0.1");
execFileSync("psql",[match[1],"-X","-q","-v","ON_ERROR_STOP=1","-f","supabase/seed.sql"],{stdio:"inherit"});
console.log("Local foundation seed data is ready.");
