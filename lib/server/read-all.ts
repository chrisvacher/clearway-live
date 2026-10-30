import "server-only";
// Every page has a stable id order. Do not rely on the Data API's 1000-row cap.
export async function readAll<T extends {id:string}>(page:(after:string|null)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]> {
 const rows:T[]=[];let after:string|null=null;
 while(true){const result=await page(after);if(result.error)throw new Error("List unavailable");const next=result.data||[];rows.push(...next);if(next.length<500)return rows;const last=next[next.length-1].id;if(last===after)throw new Error("List unavailable");after=last;}
}
