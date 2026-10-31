export type TvAppearance = { church: string; title: string; logo_url: string | null; room_code: string; theme: "dark" | "light"; texture: boolean; room_size: "very_small" | "small" | "medium" | "large" | "very_large"; reduced_motion: boolean };
export type TvPresence = { count: number; names: { key: string; name: string }[] };
export type TvBinding = { status: "paired"; engagement: string; tv: string };
export type TvStatus = TvBinding | { status: "pair"; code: string; expires_at: string } | { status: "opening" | "limited" | "unavailable" | "closed" };
export type TvReceipt = { id: string; revision: number; received_at: string; uncertainty_ms: number };
export type PairedScreen = { id: string; label: string; browser: string; paired_at: string; last_seen_at: string | null; confirmed_version: number };
export type TvManagerData = { status: "ok"; server_time: string; screens: PairedScreen[]; display: TvAppearance; tv_content: string; closed: boolean };
