// Local development database: a real PostgreSQL server run from node_modules (no Docker or system
// install needed), with its data in .localdata/pg. Staging and production use a hosted Postgres
// through DATABASE_URL instead; this script is never part of a deployment.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.cwd(), ".localdata/pg");
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "nbm",
  password: "nbm_local_dev",
  port: 54329,
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error(String(message))
});

async function main() {
  const fresh = !existsSync(resolve(dataDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase("nbm_dev");
  console.log("Local Postgres ready on postgresql://nbm:***@localhost:54329/nbm_dev (Ctrl+C to stop)");
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => { console.error(error); process.exit(1); });
