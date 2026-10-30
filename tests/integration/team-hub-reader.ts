import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { readerConfig } from "../../lib/team-hub/config";
import { TeamHubReader } from "../../lib/team-hub/reader";

async function main(){
  const output=execFileSync("supabase",["status","-o","env"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]});
  const env=Object.fromEntries([...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m=>[m[1],m[2]]));
  const source=new URL(env.DB_URL);assert.equal(source.hostname,"127.0.0.1");
  const root=new Pool({connectionString:source.toString()});
  await root.query("create database clearway_team_hub_reader_test template template0");await root.end();
  source.pathname="/clearway_team_hub_reader_test";
  const administratorUrl=source.toString();
  function sqlFile(file:string){return execFileSync("psql",[administratorUrl,"-X","-q","-v","ON_ERROR_STOP=1","-f",file],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});}
  sqlFile("tests/team-hub/fixture.sql");sqlFile("supabase/team-hub/live_reader.sql");
  const tap=sqlFile("tests/team-hub/role-checks.sql");assert.doesNotMatch(tap,/not ok|Looks like you failed/);console.log("Team Hub reader role: 28 isolated privilege/column/RLS assertions passed.");
  const admin=new Pool({connectionString:source.toString()});
  await admin.query("alter role clearway_live_reader password 'fixture-only-reader-password'");
  source.username="clearway_live_reader";source.password="fixture-only-reader-password";
  const pool=new Pool(readerConfig(source.toString()));const reader=new TeamHubReader(pool);
  const church="70000000-0000-4000-8000-000000000001",engagement="70000000-0000-4000-8000-000000000010";
  assert.equal((await reader.searchClients("fixture"))[0].id,church);
  assert.deepEqual(await reader.searchClients("%' OR true --"),[]);
  assert.equal((await reader.client(church))!.name,"Reader fixture church");
  assert.equal((await reader.engagements(church)).length,1);
  assert.equal((await reader.engagement(engagement,church))!.title,"Reader fixture engagement");
  assert.equal(await reader.engagement(engagement,"70000000-0000-4000-8000-000000000002"),null);
  const people=await reader.people(church);assert.equal(people.length,1205);assert.equal(new Set(people.map(p=>p.id)).size,1205);assert.equal(people[0].email,"primary@example.org");assert.equal(people[0].organization_role,"Board member");
  assert.equal((await reader.members())[0].email,"fac@clearway.co");
  assert.equal((await reader.elements(engagement,church)).length,1);assert.equal((await reader.events(engagement,church)).length,1);
  await assert.rejects(()=>reader.client("bad-id"));
  const {rows}=await pool.query("show default_transaction_read_only");assert.equal(rows[0].default_transaction_read_only,"on");
  await assert.rejects(()=>pool.query("select google_refresh_token from public.team_members"));
  await assert.rejects(()=>pool.query("set role clearway_live_view_owner"));
  await pool.end();
  // Prove preflight detects a PUBLIC definer escape without changing its grants.
  await admin.query("create function public.unsafe_fixture() returns text language sql security definer as $$ select 'must not be reachable'::text $$");
  try {sqlFile("supabase/team-hub/live_reader.sql");assert.fail("Unsafe PUBLIC function must stop installation");}
  catch(error){assert.match(String((error as {stderr?:unknown}).stderr),/Reader can execute existing privileged functions[\s\S]*unsafe_fixture/);}
  await admin.end();
  console.log("Team Hub reader: real restricted login, read-only transactions, 1205 people, parameterization, client scoping and privileged-function escape guard passed.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
