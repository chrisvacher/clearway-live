import "server-only";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { readerRole } from "./config";
import { teamHubDiagnostic } from "./diagnostics";
import { teamHubLogoAddress } from "./logo";

export type HubClient = {id:string;name:string;logo:string|null;timezone:string|null;address_line1:string|null;address_line2:string|null;city:string|null;state_province:string|null;postal_code:string|null;country:string|null;website:string|null;status:string|null};
export type HubEngagement = {id:string;client_id:string;title:string;engagement_type:string;status:string;start_date:string|null;end_date:string|null;assigned_consultant_id:string|null;coordinator_id:string|null};
export type HubPerson = {id:string;first_name:string|null;last_name:string|null;email:string|null;role:string|null;avatar:string|null;organization_role:string|null};
export type HubMember = {id:string;name:string;email:string};
export type HubElement = {id:string;engagement_id:string;title:string;type:string;status:string;scheduled_date:string|null;duration_minutes:number|null;order_index:number|null};
export type HubEvent = {id:string;engagement_id:string|null;engagement_element_id:string|null;client_id:string|null;event_name:string;start_date_time:string|null;end_date_time:string|null;location:string|null;location_type:string|null;status:string};
const clientColumns="id,name,logo,timezone,address_line1,address_line2,city,state_province,postal_code,country,website,status";
const engagementColumns="e.id,e.client_id,e.title,e.engagement_type,e.status,e.start_date::text,e.end_date::text,e.assigned_consultant_id,e.coordinator_id";
const uuid=(v:string)=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
function id(value:string){if(!uuid(value))throw new Error("Invalid linked record");return value;}
const wildcard=(value:string)=>`%${value.trim().slice(0,200).replace(/[\\%_]/g,"\\$&")}%`;
const clientLogo=(client:HubClient):HubClient=>({...client,logo:teamHubLogoAddress(client.id,client.logo)});

// The caller supplies only validated ids/search values. No arbitrary SQL, columns
// or schema names can be supplied by a browser or configuration setting.
export class TeamHubReader {
  constructor(private readonly pool: Pick<Pool,"connect">) {}
  private async read<T extends QueryResultRow>(query:string,values:unknown[]=[]):Promise<T[]> {
    let client:PoolClient|undefined;
    try {
      client=await this.pool.connect();
      await client.query("begin read only");
      await client.query("set local statement_timeout='5s';set local lock_timeout='1s'");
      const {rows}=await client.query("select current_user as role,current_setting('transaction_read_only') as readonly");
      if(rows[0]?.role!==readerRole || rows[0]?.readonly!=="on")throw new Error("Restricted reader connection required");
      const result=await client.query<T>(query,values);await client.query("commit");return result.rows;
    }catch(error){
      console.error("Team Hub read failed",teamHubDiagnostic(error));
      if(client)await client.query("rollback").catch(()=>{});
      throw error;
    }finally{client?.release();}
  }
  async searchClients(search="",after:string|null=null,limit=50){
    return (await this.read<HubClient>(`select ${clientColumns} from live_read.clients where name ilike $1 and ($2::uuid is null or id>$2) order by id limit $3`,[wildcard(search),after?id(after):null,Math.min(100,Math.max(1,Math.trunc(limit)||50))])).map(clientLogo);
  }
  async client(clientId:string){const client=(await this.read<HubClient>(`select ${clientColumns} from live_read.clients where id=$1`,[id(clientId)]))[0];return client?clientLogo(client):null;}
  engagements(clientId:string){return this.read<HubEngagement>(`select ${engagementColumns} from live_read.engagements e join live_read.clients c on c.id=e.client_id where e.client_id=$1 order by e.id`,[id(clientId)]);}
  async engagement(engagementId:string,clientId:string){return (await this.read<HubEngagement>(`select ${engagementColumns} from live_read.engagements e join live_read.clients c on c.id=e.client_id where e.id=$1 and e.client_id=$2`,[id(engagementId),id(clientId)]))[0]||null;}
  async people(clientId:string){
    const people:HubPerson[]=[];let after:string|null=null;
    while(true){
      const page:HubPerson[]=await this.read<HubPerson>(`select p.id,p.first_name,p.last_name,
        coalesce((select lower(btrim(pe.email)) from live_read.person_emails pe where pe.person_id=p.id and btrim(pe.email)<>'' order by pe.is_primary desc nulls last,pe.id limit 1),nullif(lower(btrim(p.email)),'')) as email,
        p.role,p.avatar,(select po.role from live_read.person_organizations po where po.person_id=p.id and po.organization_id=$1 and (po.end_date is null or po.end_date>=current_date) order by po.is_primary desc nulls last,po.id limit 1) as organization_role
        from live_read.people p where exists(select 1 from live_read.person_organizations po join live_read.clients c on c.id=po.organization_id where po.person_id=p.id and po.organization_id=$1 and (po.end_date is null or po.end_date>=current_date))
        and ($2::uuid is null or p.id>$2) order by p.id limit 500`,[id(clientId),after]);
      people.push(...page);if(page.length<500)return people;after=page[page.length-1].id;
    }
  }
  members(){return this.read<HubMember>("select id,name,lower(btrim(email)) as email from live_read.team_members order by name,id");}
  elements(engagementId:string,clientId:string){return this.read<HubElement>(`select x.id,x.engagement_id,x.title,x.type,x.status,x.scheduled_date::text,x.duration_minutes,x.order_index from live_read.engagement_elements x join live_read.engagements e on e.id=x.engagement_id join live_read.clients c on c.id=e.client_id where x.engagement_id=$1 and e.client_id=$2 order by x.order_index nulls last,x.id`,[id(engagementId),id(clientId)]);}
  events(engagementId:string,clientId:string){return this.read<HubEvent>(`select x.id,x.engagement_id,x.engagement_element_id,x.client_id,x.event_name,x.start_date_time::text,x.end_date_time::text,x.location,x.location_type,x.status from live_read.events x join live_read.engagements e on e.id=x.engagement_id join live_read.clients c on c.id=e.client_id where x.engagement_id=$1 and e.client_id=$2 and (x.client_id is null or x.client_id=$2) order by x.start_date_time nulls last,x.id`,[id(engagementId),id(clientId)]);}
}
