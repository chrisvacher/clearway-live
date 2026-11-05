// Presses made on this device: the control surface, the laptop's panels and the phone remote each
// make their own press ids here. A private notice about one of them is this device's own press, so
// it never shows as "From another remote"; a press from another device or from the team
// facilitator's remote does. Kept per tab, newest 500.
const own = new Set<string>();
const keep = 500;

export function pressId(): string {
  const id = crypto.randomUUID();
  own.add(id);
  if (own.size > keep) { const oldest = own.values().next().value; if (oldest !== undefined) own.delete(oldest); }
  return id;
}
export const ownPress = (id: string | null | undefined): boolean => typeof id === "string" && own.has(id);
