import { selfPacedLink } from "../run-of-show/self-paced";
import { retreatDates } from "../export/report-model";
import { aiDisclosure } from "../ai/disclosure";
import { copyFor } from "../brand/copy";
import type { Skin } from "../brand";

export type InvitationSnapshot={title:string;church:string;timezone:string;pre_call_at:string|null;retreat_start_date:string|null;retreat_end_date:string|null;consensus:string;people:{id:string;name:string;email:string}[]};
// A self-paced session the invite links to: open on phones between two times.
export type InvitationSelfPaced={id:string;title:string;opens_at:string;closes_at:string};
// A Novetera invite changes the words (the sign-off and the AI paragraph), and the address it is given; the sender follows the skin in sendEmailBatch.
// With AI on, the invite carries the approved AI paragraph and a link to "How we use AI" (step 5).
export function invitationMessages(engagement:string,snapshot:InvitationSnapshot,origin:string,selfPaced:InvitationSelfPaced[]=[],ai=false,skin:Skin="clearway"){
  const {inviteParagraph,pagePath}=aiDisclosure(skin),signOff=copyFor(skin).invite.signOff;
  const aiNote=ai ? `\n\n${inviteParagraph}\n${new URL(pagePath,origin)}` : "";
  const pre=snapshot.pre_call_at ? new Intl.DateTimeFormat("en-CA",{timeZone:snapshot.timezone,dateStyle:"full",timeStyle:"short"}).format(new Date(snapshot.pre_call_at))+` (${snapshot.timezone})` : "Your facilitator will confirm the pre-call time.";
  // The retreat dates are calendar days, not instants, so they read the same in any time zone: "November 3 to 4, 2026".
  const retreat=retreatDates(snapshot.retreat_start_date,snapshot.retreat_end_date) || "Your facilitator will confirm the retreat dates.";
  const when=(iso:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:snapshot.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));
  return snapshot.people.map(person=>{
    const room=new URL(`/room/${engagement}`,origin);room.searchParams.set("email",person.email);
    // Each self-paced session opens straight from its own link once the person signs in.
    const before=selfPaced.length ? `\n\nBefore we meet\n${selfPaced.map(s=>`${s.title}: open from ${when(s.opens_at)} until ${when(s.closes_at)} (${snapshot.timezone})\n${selfPacedLink(origin,engagement,s.id,person.email)}`).join("\n\n")}` : "";
    return {to:person.email,subject:`Join ${snapshot.title}`,text:`Hi ${person.name},\n\nYou’re invited to ${snapshot.title} with ${snapshot.church}.\n\nPre-call: ${pre}\nRetreat: ${retreat}\n\nOpen your room and tap Send me a sign-in code:\n${room}\n\nYou can enter the 6-digit code on your phone or tap the confirm link in the email.${aiNote}${before}\n\nHow the room decides\n${snapshot.consensus}\n\nWe look forward to being with you.\n${signOff}`};
  });
}
