import { createServerClient } from "@supabase/ssr";
import type { CookieJar } from "@/lib/auth/client";
import { authConfig } from "@/lib/auth/policy";

export const roomCookie = (engagement:string) => `cw-room-${engagement}`;
export function hasRoomCookie(jar:Pick<CookieJar,"getAll">,engagement:string){
  const name=roomCookie(engagement);
  return jar.getAll().some(cookie=>cookie.name===name||cookie.name.startsWith(name+"."));
}
export function participantClient(jar:CookieJar,engagement:string){
  const config=authConfig();
  if(!config)throw new Error("Sign-in unavailable");
  return createServerClient(config.url,config.key,{
    cookieOptions:{name:roomCookie(engagement),httpOnly:true,sameSite:"lax",path:"/",secure:config.secure},
    cookies:jar,
    global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store"})},
  });
}
