import test from "node:test";
import assert from "node:assert/strict";
import { zoneOptions,canadaZones,usZones } from "../../lib/setup/timezones";
import { logoKind,logoPath } from "../../lib/setup/logo";
import { setupInput } from "../../lib/setup/policy";
test("the time zone list puts Canada and the United States first, then the rest",()=>{
 const groups=zoneOptions("America/Toronto",["Europe/London","America/Toronto","Africa/Cairo","America/New_York"]);
 assert.deepEqual(groups.map(g=>g.label),["Canada","United States","All time zones"]);
 assert.deepEqual(groups[0].zones,canadaZones); assert.deepEqual(groups[1].zones,usZones);
 assert.deepEqual(groups[2].zones,["Africa/Cairo","Europe/London"]);
});
test("the stored time zone is always in the list, even when the browser does not list it",()=>{
 const all=(stored:string,supported?:string[])=>zoneOptions(stored,supported).flatMap(g=>g.zones);
 assert.ok(all("Asia/Calcutta",["Asia/Kolkata"]).includes("Asia/Calcutta"));
 assert.ok(all("Asia/Calcutta").includes("Asia/Calcutta"));
 assert.equal(all("America/Toronto").filter(z=>z==="America/Toronto").length,1);
});
test("a logo is judged by its bytes",()=>{
 const pad=(...b:number[])=>Uint8Array.from([...b,...new Array(20).fill(0)]);
 assert.equal(logoKind(pad(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))?.type,"image/png");
 assert.equal(logoKind(pad(0xff,0xd8,0xff,0xe0))?.ext,"jpg");
 assert.equal(logoKind(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0,0,0,0]))?.ext,"webp");
 assert.equal(logoKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")),null);
 assert.equal(logoKind(new TextEncoder().encode("this is not a picture at all")),null);
 assert.equal(logoPath("c1","t1",{ext:"png",type:"image/png"}),"c1/t1.png");
});
test("a logo address must be HTTPS, except on this machine",()=>{
 const save=(logo_url:string)=>setupInput({church:{name:"Riverside",timezone:"America/Toronto",logo_url},engagement:{title:"Planning",type:"team_workshop",status:"setup",start_date:"2027-02-20",end_date:"",retreat_start_date:"",retreat_end_date:"",base_year:"",lens_names:[],how_the_room_decides:"x",settings:{}}}).church.logo_url;
 assert.equal(save("https://example.org/a.png"),"https://example.org/a.png");
 assert.equal(save("http://127.0.0.1:54321/storage/v1/object/public/church-logos/a.png"),"http://127.0.0.1:54321/storage/v1/object/public/church-logos/a.png");
 assert.throws(()=>save("http://example.org/a.png"),/HTTPS/);
});
