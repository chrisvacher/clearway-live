export const readerRole = "clearway_live_reader";
const hubProject = "tilmrkgiwlpuflbtueen";
export function readerConfig(connectionString: string) {
  const url = new URL(connectionString);
  if (!["postgres:","postgresql:"].includes(url.protocol)) throw new Error("Use the Team Hub reader connection");
  const user=decodeURIComponent(url.username);
  const local=["localhost","127.0.0.1"].includes(url.hostname);
  const direct=url.hostname===`db.${hubProject}.supabase.co` && user===readerRole;
  const pooled=url.hostname.endsWith(".pooler.supabase.com") && user===`${readerRole}.${hubProject}`;
  if ((!local && !direct && !pooled) || (local && user!==readerRole)) throw new Error("Use the restricted Team Hub reader role");
  // Pass explicit fields so a DSN's sslmode query cannot disable certificate checks.
  return {host:url.hostname,port:Number(url.port||5432),user,password:decodeURIComponent(url.password),
    database:decodeURIComponent(url.pathname.slice(1)||"postgres"),ssl:local?false:{rejectUnauthorized:true},
    max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,query_timeout:6000,
    application_name:"clearway-live-reader"};
}
