// What the setup API tells the page when the database refuses. A message the database raises on purpose (a plain sentence, written for the
// facilitator) goes through with a fitting status. Everything else stays hidden behind the page's generic line: raw errors name tables,
// constraints and policies, which no one in the room should read.
export type DatabaseError = { code?: string | null; message?: string | null; details?: string | null };
export type Failure = { message: string; status: number };

const SENTENCE = /^[A-Z][A-Za-z0-9 ,’'-]{4,140}\.$/;
const RAW = /constraint|violates|relation|column|policy|row-level|function|schema|table|duplicate key|syntax|permission denied/i;

export function deliberate(error: DatabaseError | null | undefined): Failure | null {
  if (!error) return null;
  const message = (error.message ?? "").trim();
  // The one unique index a facilitator can hit by editing a person: two people in an engagement, one email address.
  if (error.code === "23505" && message.includes("attendees_email_unique")) return { message: "Someone in this engagement already has that email address.", status: 409 };
  // A row-level security refusal names the table, so the page gets a plain line instead.
  if (error.code === "42501") return { message: "You don’t have access to do that for this engagement.", status: 403 };
  if ((error.code === "23514" || error.code === "P0001") && SENTENCE.test(message) && !RAW.test(message))
    return { message, status: message.startsWith("Wait ") ? 429 : message.startsWith("Review ") ? 409 : 400 };
  return null;
}

// Thrown by the setup route for a refusal worth showing; the route's catch makes it the response.
export class SetupRefusal extends Error {
  constructor(readonly failure: Failure) { super(failure.message); }
}
