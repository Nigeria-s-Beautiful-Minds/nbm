// Calls the housekeeping endpoint once. Run it from cron every five minutes in staging/production:
//   */5 * * * *  cd /path/to/nbm && npm run jobs
const base = (process.env.NEXTAUTH_URL || "http://localhost:4174").replace(/\/$/, "");

async function main() {
  const res = await fetch(`${base}/api/jobs`, { method: "POST", headers: { Authorization: `Bearer ${process.env.JOBS_SECRET ?? ""}` } });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
