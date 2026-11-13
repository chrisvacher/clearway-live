import { randomUUID } from "node:crypto";
import { NextResponse,type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig,sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { serviceClient } from "@/lib/server/supabase";
import { uuid } from "@/lib/room/policy";
import { logoBucket,logoKind,logoMaxBytes,logoPath } from "@/lib/setup/logo";
export const runtime="nodejs";
const answer=(data:Record<string,unknown>,status=200)=>privateResponse(NextResponse.json(data,{status}));
const refuse=(message:string,status=400)=>answer({ok:false,message},status);
// A facilitator of the engagement uploads the church's logo. The file is written with the service role (the secret stays here),
// and the public address goes back to the page, which saves it into the church's logo address like any other field.
export async function POST(request:NextRequest){
  const config=authConfig();if(!config||!sameOrigin(request,config.origin))return answer({ok:false},403);
  const fac=await getFacilitator();if(!fac)return answer({ok:false},401);
  try{
    if(Number(request.headers.get("content-length")||0)>logoMaxBytes+16384)return refuse("Use a logo that is 1 MB or smaller.",413);
    const form=await request.formData(),id=form.get("id"),file=form.get("file");
    if(!uuid(id)||!(file instanceof File))return refuse("Choose a logo to upload.");
    // The same engagement check as the setup API: row-level security shows a facilitator only their own engagements.
    const {data:e,error}=await fac.client.from("engagements").select("church_id").eq("id",id).eq("deleted",false).maybeSingle();
    if(error||!e)return answer({ok:false},404);
    if(file.size>logoMaxBytes)return refuse("Use a logo that is 1 MB or smaller.",413);
    const bytes=new Uint8Array(await file.arrayBuffer()),kind=logoKind(bytes);
    if(!kind)return refuse("Use a PNG, JPEG or WebP image.",415);
    const path=logoPath(e.church_id,randomUUID(),kind),storage=serviceClient().storage.from(logoBucket);
    const {error:failed}=await storage.upload(path,bytes,{contentType:kind.type,upsert:false,cacheControl:"31536000"});
    if(failed){
      const text=`${failed.message} ${(failed as {statusCode?:string}).statusCode??""}`;
      if(/bucket not found|not found|404/i.test(text))return refuse("Logo upload isn’t available yet.",503);
      return refuse("We couldn’t upload that logo. Please try again.",502);
    }
    return answer({ok:true,url:storage.getPublicUrl(path).data.publicUrl});
  }catch{return refuse("We couldn’t upload that logo. Please try again.",400);}
}
