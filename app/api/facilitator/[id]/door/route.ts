import { NextResponse,type NextRequest } from "next/server";
import { getFacilitator } from "@/lib/server/facilitator";
import { authConfig,sameOrigin } from "@/lib/auth/policy";
import { privateResponse } from "@/lib/auth/response";
import { limitedJson } from "@/lib/server/request";
import { uuid } from "@/lib/room/policy";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const config=authConfig(); if(!config || !sameOrigin(request,config.origin)) return privateResponse(NextResponse.json({ok:false},{status:403}));
  const facilitator=await getFacilitator(); if(!facilitator) return privateResponse(NextResponse.json({ok:false},{status:401}));
  const {id}=await params; if(!uuid(id)) return privateResponse(NextResponse.json({ok:false},{status:400}));
  try {
    const body=await limitedJson(request); const {client}=facilitator;
    // RLS first checks the requested engagement. The atomic RPC checks again.
    const {data:engagement}=await client.from("engagements").select("id").eq("id",id).eq("deleted",false).maybeSingle();
    if(!engagement) return privateResponse(NextResponse.json({ok:false},{status:404}));
    if(body.action==="manual" && uuid(body.attendee) && typeof body.code==="string" && /^[A-HJ-NP-Z2-9]{8}$/.test(body.code.toUpperCase().replaceAll(" ",""))) {
      const {data,error}=await client.rpc("sign_in_room_device",{p_engagement:id,p_attendee:body.attendee,p_code:body.code});
      return privateResponse(NextResponse.json({ok:!error && data===true}));
    }
    if(typeof body.action === "string" && ["approve","decline"].includes(body.action) && uuid(body.request)) {
      const {data:join}=await client.from("join_requests").select("id").eq("id",body.request).eq("engagement_id",id).eq("deleted",false).maybeSingle();
      if(!join) return privateResponse(NextResponse.json({ok:false},{status:404}));
      const {data,error}=await client.rpc("decide_room_join",{p_request:body.request,p_approve:body.action==="approve"});
      return privateResponse(NextResponse.json({ok:!error && data===true}));
    }
  } catch { /* Return a quiet, non-sensitive failure. */ }
  return privateResponse(NextResponse.json({ok:false},{status:400}));
}
