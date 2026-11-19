// The room link a facilitator chooses (live.clearway.co/NAME), checked the way the database checks it (20261111200000_join_link):
// letters and digits only, 3 to 24, lower case, never shaped like a generated room code, never a word the app uses.
export const reservedLinkNames = ["practice", "setup", "control", "remote", "room", "tv", "api", "auth", "signin", "signout", "admin", "join", "live", "clearway", "help",
  "about", "privacy", "terms", "howweuseai", "static", "public", "favicon", "robots", "sitemap", "next"];

export const cleanLinkName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function linkNameProblem(value: string): { name: string; problem: string | null } {
  const name = cleanLinkName(value);
  if (!/^[a-z0-9]{3,24}$/.test(name) || /^[a-f0-9]{8}$/.test(name)) return { name, problem: "Use 3 to 24 letters or numbers, with no spaces. A room link can’t look like a generated room code." };
  if (reservedLinkNames.includes(name)) return { name, problem: "That room link is used by the app. Choose another." };
  return { name, problem: null };
}

// A starting suggestion from the church's name: the name itself when it is short, otherwise its initials
// ("Pickering Pentecostal Church" is ppc). The facilitator can type anything else.
export function suggestLinkName(church: string) {
  const whole = cleanLinkName(church);
  if (whole.length >= 3 && whole.length <= 14 && !linkNameProblem(whole).problem) return whole;
  const initials = cleanLinkName(church.split(/\s+/).map(word => word[0] ?? "").join(""));
  if (initials.length >= 3 && !linkNameProblem(initials).problem) return initials;
  const cut = whole.slice(0, 14);
  return linkNameProblem(cut).problem ? "" : cut;
}
