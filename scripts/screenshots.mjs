// Screenshot review: captures the main pages at desktop, tablet and mobile widths into
// .tmp/screenshots/<run>/ and reports any page that overflows horizontally.
// Retention: only the five most recent runs are kept.
//   node --env-file=.env scripts/screenshots.mjs [--only=/path,/path] [--auth]
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer";

const BASE = (process.env.NEXTAUTH_URL || "http://localhost:4174").replace(/\/$/, "");
const ROOT = ".tmp/screenshots";
const KEEP_RUNS = 5;
const VIEWPORTS = [["desktop", 1366, 900], ["tablet", 820, 1100], ["mobile", 375, 760]];
const PUBLIC = ["/", "/about", "/about/news", "/about/team", "/about/privacy", "/get-involved", "/get-involved/contribute", "/get-involved/volunteer", "/get-involved/contact", "/exhibitions", "/exhibitions/sample-ai-data", "/discussion", "/mentorship", "/sponsorship", "/sponsorship/sample-campaign", "/join", "/login"];
const PRIVATE = ["/account/workspace", "/exhibitions/new", "/mentorship/mentor", "/admin", "/admin/exhibitions", "/admin/sponsorship", "/admin/content"];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const withAuth = process.argv.includes("--auth");
// --dark captures the dark theme by setting the saved choice before each page loads.
const dark = process.argv.includes("--dark");
const run = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(ROOT, run);
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }]);
if (dark) await page.evaluateOnNewDocument(() => { try { localStorage.setItem("nbm-theme", "dark"); } catch {} });
const problems = [];

async function shoot(path) {
  for (const [name, width, height] of VIEWPORTS) {
    await page.setViewport({ width, height });
    const res = await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${path} @${name}: horizontal overflow of ${overflow}px`);
    if (!res || res.status() >= 400) problems.push(`${path} @${name}: HTTP ${res?.status()}`);
    await page.screenshot({ path: join(outDir, `${path.replace(/\//g, "_").replace(/^_$/, "_home")}-${name}${dark ? "-dark" : ""}.png`), fullPage: true });
  }
}

for (const path of only ?? PUBLIC) await shoot(path);

if (withAuth || only?.some((p) => PRIVATE.includes(p))) {
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", process.env.ADMIN_EMAIL);
  await page.type("#password", process.env.ADMIN_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
  if (!only) for (const path of PRIVATE) await shoot(path);
  else for (const path of only) await shoot(path);
}

await browser.close();

const runs = (await readdir(ROOT)).sort();
for (const old of runs.slice(0, Math.max(0, runs.length - KEEP_RUNS))) await rm(join(ROOT, old), { recursive: true, force: true });

console.log(`Saved to ${outDir}`);
console.log(problems.length ? `Problems:\n- ${problems.join("\n- ")}` : "No overflow or HTTP problems found.");
