import type { NextRequest } from "next/server";
import { authResponse, clearFacilitatorCookies } from "@/lib/auth/response";
import { clearwayEmail, destination } from "@/lib/auth/policy";

export async function GET(request: NextRequest) {
  const { config, client, response } = authResponse(request);
  if (!config || !client) return response;
  const code = request.nextUrl.searchParams.get("code");
  let accepted = false;
  let createdSession = false;
  if (code && !request.nextUrl.searchParams.has("error")) {
    const { data: exchanged, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && exchanged.session) {
      createdSession = true;
      const { data: { user }, error: invalid } = await client.auth.getUser();
      if (!invalid && user && clearwayEmail(user.email)) {
        const { data, error: denied } = await client.rpc("claim_clearway_access");
        accepted = !denied && data === true;
        if (accepted) {
          // Supabase's OAuth exchange also returns Google's provider credentials.
          // Persist only the app session. This flow does not use Google API tokens.
          const { error: failed } = await client.auth.setSession({
            access_token: exchanged.session.access_token,
            refresh_token: exchanged.session.refresh_token,
          });
          accepted = !failed;
        }
      }
    }
  }
  if (accepted) response.headers.set("Location", new URL(destination(request.nextUrl.searchParams.get("next")), config.origin).toString());
  else {
    // Revoke this session only. Other signed-in devices are left intact.
    if (createdSession) {
      await client.auth.signOut({ scope: "local" });
      clearFacilitatorCookies(request, response);
    } else {
      // An unsolicited callback must not revoke an existing valid session.
      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith("cw-facilitator-code-verifier")) response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: config.secure });
      }
    }
    response.headers.set("Location", new URL("/sign-in?error=access", config.origin).toString());
  }
  return response;
}
