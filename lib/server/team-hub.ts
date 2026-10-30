import "server-only";
import { Pool } from "pg";
import { readerConfig } from "@/lib/team-hub/config";
import { TeamHubReader } from "@/lib/team-hub/reader";

let pool:Pool|undefined;
export function teamHubConfigured(){return Boolean(process.env.TEAM_HUB_DATABASE_URL);}
export function teamHubReader(){
  if(!process.env.TEAM_HUB_DATABASE_URL)throw new Error("Team Hub connection unavailable");
  if(!pool){pool=new Pool(readerConfig(process.env.TEAM_HUB_DATABASE_URL));pool.on("error",()=>{/* Recover via a fresh pooled connection on the next request. */});}
  return new TeamHubReader(pool);
}
