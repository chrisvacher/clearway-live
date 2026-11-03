import { selfPacedLink } from "../run-of-show/self-paced";

export type InvitationSnapshot={title:string;church:string;timezone:string;pre_call_at:string|null;retreat_start_date:string|null;retreat_end_date:string|null;consensus:string;people:{id:string;name:string;email:string}[]};
// A self-paced session the invite links to: open on phones between two times.
export type InvitationSelfPaced={id:string;title:string;opens_at:string;closes_at:string};
export function invitationMessages(engagement:string,snapshot:InvitationSnapshot,origin:string,selfPaced:InvitationSelfPaced[]=[]){
  const pre=snapshot.pre_call_at ? new Intl.DateTimeFormat("en-CA",{timeZone:snapshot.timezone,dateStyle:"full",timeStyle:"short"}).format(new Date(snapshot.pre_call_at))+` (${snapshot.timezone})` : "Your facilitator will confirm the pre-call time.";
  const retreat=snapshot.retreat_start_date ? `${snapshot.retreat_start_date}${snapshot.retreat_end_date && snapshot.retreat_end_date!==snapshot.retreat_start_date?` to ${snapshot.retreat_end_date}`:""}` : "Your facilitator will confirm the retreat dates.";
  const when=(iso:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:snapshot.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
  return snapshot.people.map(person=>{
    const room=new URL(`/room/${engagement}`,origin);room.searchParams.set("email",person.email);
    // Each self-paced session opens straight from its own link once the person signs in.
    const before=selfPaced.length ? `\n\nBefore we meet\n${selfPaced.map(s=>`${s.title}: open from ${when(s.opens_at)} until ${when(s.closes_at)} (${snapshot.timezone})\n${selfPacedLink(origin,engagement,s.id,person.email)}`).join("\n\n")}` : "";
    return {to:person.email,subject:`Join ${snapshot.title}`,text:`Hi ${person.name},\n\nYou’re invited to ${snapshot.title} with ${snapshot.church}.\n\nPre-call: ${pre}\nRetreat: ${retreat}\n\nOpen your room and tap Send me a sign-in code:\n${room}\n\nYou can enter the 6-digit code on your phone or tap the confirm link in the email.${before}\n\nHow the room decides\n${snapshot.consensus}\n\nWe look forward to being with you.\nClearway`};
  });
}
