import { Surface } from "@/components/layout/surface";

export const metadata = { title: "Event link" };

// Where an event's admin link lands when it can't open the event: replaced by a new link, unknown, or briefly unavailable.
export default async function LinkEnded({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const [title, text] = reason === "replaced" ? ["This link has been replaced", "Ask the person who sent it for the new link."]
    : reason === "unavailable" ? ["We couldn’t open the event", "Please try the link again in a moment."]
    : ["This link doesn’t open an event", "Check you have the whole link, or ask the person who sent it."];
  return <Surface surface="control" theme="light"><main id="main" className="page-width narrow"><section className="admin-panel" role="status"><h1>{title}</h1><p>{text}</p></section></main></Surface>;
}
