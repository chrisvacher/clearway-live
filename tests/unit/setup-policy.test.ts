import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv,parsePasted,validatePeople,date,zonedInstant,consensus } from "../../lib/setup/policy";
import { invitationMessages } from "../../lib/setup/invitation";
test("CSV preserves quoted fields, BOM, extra columns, normalized email and first duplicate",()=>{
 const r=parseCsv('\uFEFFname,email,role,notes\r\n"Lee, Ann", ANN@Example.org ,Pastor,"Line one\nLine ""two"""\r\nOther,ann@example.org,Elder,Ignored');
 assert.equal(r.people.length,1);assert.equal(r.people[0].name,"Lee, Ann");assert.equal(r.people[0].email,"ann@example.org");assert.equal(r.people[0].role_at_church,"Pastor");assert.equal(r.people[0].room_role,undefined);assert.equal(r.people[0].extra_fields.notes,'Line one\nLine "two"');assert.deepEqual(r.duplicates,["ann@example.org"]);
});
test("imports reject malformed records and ambiguous headers without prototype mutation",()=>{
 for(const s of ['name,email,email\nAnn,a@example.org,a@example.org','name,email\n"Ann,a@example.org','name,email\nAnn,a@example.org,extra','name,email\nAnn,invalid','name,email\n"Ann"x,a@example.org'])assert.throws(()=>parseCsv(s));
 const p=parseCsv('name,email,__proto__,constructor\nAnn,a@example.org,value,other').people[0];assert.equal(p.extra_fields.__proto__,"value");assert.equal({}.hasOwnProperty("polluted"),false);
 assert.throws(()=>validatePeople([{name:"Ann",email:"a@example.org",room_role:"admin"}]));assert.throws(()=>parseCsv("x".repeat(131073)));
});
test("pasted people normalize and deduplicate and room roles are explicit",()=>{
 const r=parsePasted(' Ann Lee <Ann@example.org>\nOther <ann@example.org>\nBeth May <b@example.org>');assert.equal(r.people.length,2);assert.equal(r.duplicates.length,1);assert.throws(()=>parsePasted("Ann a@example.org"));
 assert.equal(parseCsv('name,email,room_role\nAnn,a@example.org,scribe').people[0].room_role,"scribe");
});
test("dates and church local times reject invalid dates and daylight-saving gaps or ambiguity",()=>{
 assert.equal(date("2028-02-29"),"2028-02-29");assert.throws(()=>date("2026-02-29"));assert.equal(zonedInstant("2026-11-04T14:00","America/Toronto"),"2026-11-04T19:00:00.000Z");
 assert.throws(()=>zonedInstant("2026-03-08T02:30","America/Toronto"));assert.throws(()=>zonedInstant("2026-11-01T01:30","America/Toronto"));
});
test("each personal invite carries saved consensus, dates and the prefilled room link",()=>{
 const [m]=invitationMessages("room",{title:"Wayfinding",church:"Riverside",timezone:"America/Toronto",pre_call_at:"2026-11-04T19:00Z",retreat_start_date:"2026-11-18",retreat_end_date:"2026-11-19",consensus,people:[{id:"a",name:"Ann",email:"a+test@example.org"}]},"https://live.clearway.co");
 assert.equal(m.to,"a+test@example.org");assert.ok(m.text.includes(consensus));assert.match(m.text,/2026-11-18 to 2026-11-19/);const link=m.text.match(/https:\/\/[^\s]+/)![0];assert.equal(new URL(link).searchParams.get("email"),m.to);assert.match(m.text,/Send me a sign-in code/);
});
