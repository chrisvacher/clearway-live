import { practiceCode, roomCode, typedRoomCode } from "@/lib/tv/policy";

// What a path segment or a typed value can be as a room link. No server imports, so middleware and tests can use it.
// A path segment counts as a room link only when it is shaped like one, so a mistyped
// page (live.clearway.co/remote) gets the app's not-found page instead of the join box.
export const practice = (code: string) => code === practiceCode;
export const codeShaped = (segment: string) => { const code = typedRoomCode(segment); return roomCode(code) || practice(code); };
// A link name a facilitator chose (live.clearway.co/hopeoakville): 3 to 24 letters or digits.
export const nameShaped = (segment: string) => /^[a-z0-9]{3,24}$/i.test(segment.trim()) && !roomCode(segment.trim());
