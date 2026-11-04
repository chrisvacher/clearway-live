// An easel photo, served by our own signed-in route under the facilitator's session (never a CDN).
export const fileUrl = (engagement: string, file: string) => `/api/scribe/${engagement}/files/${file}?surface=control`;
export function Photo({ engagement, file, name, className }: { engagement: string; file: string; name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- served by our own signed-in route, never optimised by a CDN
  return <img className={className} src={fileUrl(engagement, file)} alt={`Easel photo, ${name}`} loading="lazy" />;
}
