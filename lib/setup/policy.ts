import { normalizedEmail, uuid } from "../room/identity";

export const consensus = "The room makes each decision by consensus. Votes and points show where the room is. We listen to each other and make space for concerns before agreeing on what we’ll do next.";
export type ImportPerson = {name:string;email:string;role_at_church:string;room_role?:"participant"|"scribe";extra_fields:Record<string,string>;team_hub_person_id?:string};
export type ImportPreview = {people:ImportPerson[];duplicates:string[]};
function text(value:unknown,max=200,required=false){if(typeof value!=="string" || value.trim().length>max || (required && !value.trim()))throw new Error("Check the highlighted details.");return value.trim();}
export function date(value:unknown):string|null {
  if(value==="" || value==null)return null;
  const v=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number(v.slice(0,4))<1900 || Number(v.slice(0,4))>9990 || new Date(v+"T00:00:00Z").toISOString().slice(0,10)!==v)throw new Error("Use a valid date.");return v;
}
function localFormat(value:Date,zone:string){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(value);const part=(key:string)=>p.find(x=>x.type===key)!.value;return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;}
export function localTime(value:string|null,zone:string){return value?localFormat(new Date(value),zone):"";}
export function zonedInstant(value:unknown,zone:string):string|null {
  if(value==="" || value==null)return null;const v=text(value,16);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || !date(v.slice(0,10)))throw new Error("Use a valid pre-call time.");
  const naive=Date.parse(v+":00Z");if(!Number.isFinite(naive))throw new Error("Use a valid pre-call time.");
  const offsets=new Set([-86400000,0,86400000].map(delta=>Date.parse(localFormat(new Date(naive+delta),zone)+":00Z")-(naive+delta)));
  const candidates=[...offsets].map(offset=>new Date(naive-offset)).filter(d=>localFormat(d,zone)===v);
  if(candidates.length!==1)throw new Error("That local time changes with daylight saving. Choose a time outside the clock change.");return candidates[0].toISOString();
}
export function setupInput(body:Record<string,unknown>){
  const church=body.church as Record<string,unknown>,eng=body.engagement as Record<string,unknown>;
  if(!church || !eng)throw new Error("Check the engagement details.");
  const timezone=text(church.timezone,100,true);try{new Intl.DateTimeFormat("en",{timeZone:timezone});}catch{throw new Error("Use a valid IANA time zone, such as America/Toronto.");}
  const start=date(eng.start_date),end=date(eng.end_date),retreatStart=date(eng.retreat_start_date),retreatEnd=date(eng.retreat_end_date);
  if((start && end && end<start)||(retreatStart && retreatEnd && retreatEnd<retreatStart))throw new Error("The end date must follow the start date.");
  const type=text(eng.type,40);if(!["wayfinding","day_and_a_half","team_workshop","practice"].includes(type))throw new Error("Choose an engagement type.");
  const status=text(eng.status,40);if(!["setup","discover","pre_call","retreat","follow_up","closed"].includes(status))throw new Error("Choose an engagement status.");
  const base=eng.base_year==="" || eng.base_year==null ? Number((retreatStart||start||new Date().toISOString()).slice(0,4)) : Number(eng.base_year);
  if(!Number.isInteger(base)||base<1900||base>9990)throw new Error("Use a base year from 1900 to 9990.");
  if(!Array.isArray(eng.lens_names)||eng.lens_names.length!==5)throw new Error("Name all Five Lenses.");
  const settings=(eng.settings || {}) as Record<string,unknown>;
  const theme=text(settings.tv_theme??"dark",10);if(!["dark","light"].includes(theme))throw new Error("Choose a TV theme.");
  const size=text(settings.room_size??"very_small",20);if(!["very_small","small","medium","large","very_large"].includes(size))throw new Error("Choose a room size.");
  const list=(v:unknown)=>text(v??"",10000).split("\n").map(s=>s.trim()).filter(Boolean);
  const logo=text(church.logo_url??"",2000);if(logo){const u=new URL(logo);if(u.protocol!=="https:")throw new Error("Use an HTTPS logo address.");}
  return {church:{name:text(church.name,200,true),timezone,logo_url:logo||null,mission:text(church.mission??"",10000),purpose:text(church.purpose??"",10000),values:list(church.values),strategy:text(church.strategy??"",10000),leadership_rhythms:list(church.leadership_rhythms),governance_body_name:text(church.governance_body_name??"",200)},engagement:{title:text(eng.title,200,true),type,status,start_date:start,end_date:end,retreat_start_date:retreatStart,retreat_end_date:retreatEnd,pre_call_at:zonedInstant(eng.pre_call_local,timezone),base_year:base,lens_names:eng.lens_names.map(v=>text(v,100,true)),how_the_room_decides:text(eng.how_the_room_decides,4000,true),settings:{ai_enabled:settings.ai_enabled===true,scripture_translation:text(settings.scripture_translation??"",100),tv_theme:theme,texture:settings.texture!==false,room_size:size,neutral_join_message:settings.neutral_join_message===true}}};
}
function deduplicate(people:ImportPerson[]):ImportPreview {
  if(people.length>500)throw new Error("Import up to 500 people at a time.");const seen=new Set<string>(),duplicates:string[]=[];
  return {people:people.filter(p=>{if(seen.has(p.email)){duplicates.push(p.email);return false;}seen.add(p.email);return true;}),duplicates};
}
export function validatePeople(rows:unknown):ImportPreview {
  if(!Array.isArray(rows))throw new Error("Choose people to import.");
  return deduplicate(rows.map(row=>{if(!row || typeof row!=="object")throw new Error("Check each person’s details.");const email=normalizedEmail(row.email);if(!email)throw new Error("Each person needs a valid email address.");
    if(row.room_role!==undefined && !["participant","scribe"].includes(row.room_role))throw new Error("Choose Participant or Scribe.");
    const extra=row.extra_fields??{};if(!extra || typeof extra!=="object"||Array.isArray(extra)||Object.keys(extra).length>50)throw new Error("Check the additional fields.");
    return {name:text(row.name,200,true),email,role_at_church:text(row.role_at_church??"",200),...(row.room_role?{room_role:row.room_role}:{}),extra_fields:Object.fromEntries(Object.entries(extra).map(([k,v])=>[text(k,100,true),text(v,2000)])),...(uuid(row.team_hub_person_id)?{team_hub_person_id:row.team_hub_person_id}:{})};}));
}
function csvRows(source:string){
  if(new TextEncoder().encode(source).length>131072)throw new Error("Use a CSV smaller than 128 KB.");
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false,ended=false;source=source.replace(/^\uFEFF/,"");
  for(let i=0;i<source.length;i++){const c=source[i];if(quoted){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;ended=true;}}else field+=c;}
    else if(c==='"' && !field && !ended)quoted=true;
    else if(c==="," || c==="\n" || c==="\r"){row.push(field);field="";ended=false;if(c!==","){if(c==="\r"&&source[i+1]==="\n")i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}
    else {if(ended || c==='"')throw new Error("Check the CSV quotation marks.");field+=c;}}
  if(quoted)throw new Error("Close every quoted CSV field.");row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function parseCsv(source:string):ImportPreview {
  const [raw,...rows]=csvRows(source);if(!raw)throw new Error("Add a CSV with name and email columns.");
  const headers=raw.map(v=>v.trim().toLowerCase().replace(/[ -]+/g,"_"));if(new Set(headers).size!==headers.length||headers.some(h=>!h))throw new Error("Give each CSV column a different name.");
  if(!headers.includes("name")||!headers.includes("email"))throw new Error("The CSV needs name and email columns.");
  return validatePeople(rows.map(row=>{if(row.length!==headers.length)throw new Error("Each CSV row needs the same number of columns.");const v=Object.fromEntries(headers.map((h,i)=>[h,row[i]]));return {name:v.name,email:v.email,role_at_church:v.role_at_church||v.role||"",...(v.room_role?{room_role:v.room_role.toLowerCase().trim()}:{}),extra_fields:Object.fromEntries(headers.filter(h=>!["name","email","role","role_at_church","room_role"].includes(h)).map(h=>[h,v[h]]))};}));
}
export function parsePasted(source:string):ImportPreview {
  if(source.length>131072)throw new Error("Paste up to 128 KB of names.");return validatePeople(source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{const m=line.match(/^(.+?)\s*<([^<>]+)>$/);if(!m)throw new Error("Use Name <email@example.org> on each line.");return {name:m[1],email:m[2]};}));
}
