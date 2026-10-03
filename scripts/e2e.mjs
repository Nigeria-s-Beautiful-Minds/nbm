// Browser walk-through of the journeys that go through real forms: join and email confirmation,
// posting an exhibition with a real upload, volunteer, mailing-list double opt-in, contact,
// a sandbox contribution, and the navigation by keyboard and on a phone-sized screen.
//   node --env-file=.env scripts/e2e.mjs
// It removes the records it creates. Emails are read from the queue table, not a real inbox.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";

const BASE = (process.env.NEXTAUTH_URL || "http://localhost:4174").replace(/\/$/, "");
const prisma = new PrismaClient();
const run = `e2e${Date.now().toString(36)}`;
const email = `${run}@test.nbm.local`;
const password = "e2e-password-123";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => { try { await fn(); results.push(`PASS  ${name}`); } catch (err) { results.push(`FAIL  ${name}: ${err.message.split("\n")[0]}`); } };

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("dialog", (dialog) => dialog.accept());
// A page is ready once React has attached to the header; on a busy machine that can lag behind the
// network going quiet, and a click before it would be lost.
const interactive = () => page.waitForFunction(() => Object.keys(document.querySelector(".theme-toggle") ?? {}).some((k) => k.startsWith("__reactProps")), { timeout: 30000, polling: 100 }).catch(() => {});
const go = async (path) => { const response = await page.goto(BASE + path, { waitUntil: "networkidle2" }); await interactive(); return response; };
const text = () => page.evaluate(() => document.body.innerText);
const submit = async (selector = "form button[type=submit]") => { await pause(1700); await page.click(selector); };
const linkFromEmail = async (kind, to) => {
  const row = await prisma.emailOutbox.findFirst({ where: { toEmail: to, kind }, orderBy: { createdAt: "desc" } });
  assert.ok(row, `no ${kind} email queued`);
  return row.html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&").replace(BASE, "");
};

await step("join creates an account and queues a confirmation email", async () => {
  await go("/join");
  await page.type("#name", "E2E Member");
  await page.type("#email", email);
  await page.type("#password", password);
  await page.click("#consent");
  await submit();
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15000 });
  assert.match(await text(), /Account created/);
});

await step("the confirmation link verifies the email; a second use is refused", async () => {
  const link = await linkFromEmail("verify-email", email);
  await go(link);
  assert.match(await text(), /Email confirmed/);
  await go(link);
  assert.match(await text(), /didn.t work/);
});

await step("sign in, then the account menu works", async () => {
  await go("/login");
  await page.type("#email", email);
  await page.type("#password", password);
  // Give the form time to become interactive on a slow machine; an early click would submit it natively.
  await pause(1700);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("form button[type=submit]")]);
  assert.match(await text(), /My workspace/);
});

let slug = "";
await step("a member posts an exhibition with a real photo; it waits for review", async () => {
  await go("/exhibitions/new");
  await page.type("#title", "E2E browser-posted project");
  await page.select("#topic", "Software & Digital");
  await page.select("#stage", "PROTOTYPE");
  await page.type("#description", "Posted by the browser walk-through with a real image upload to check the whole flow.");
  const input = await page.$("input[type=file]");
  await input.uploadFile(resolve("prisma/demo-assets/environment-water.jpg"));
  await page.waitForSelector("[id^=alt-]");
  await page.type("[id^=alt-]", "A map of West Africa used as a test image");
  await page.waitForFunction(() => !document.body.innerText.includes("Uploading"), { timeout: 30000 });
  await Promise.all([page.waitForFunction(() => /^\/exhibitions\/e2e-/.test(location.pathname), { timeout: 20000 }), page.click("form button[type=submit]")]);
  slug = new URL(page.url()).pathname.split("/").pop();
  assert.match(await text(), /Awaiting review/);
  const anon = await fetch(`${BASE}/exhibitions/${slug}`);
  assert.equal(anon.status, 404, "visitors can't see it yet");
});

await step("volunteer application is saved and acknowledged as received, not accepted", async () => {
  await go("/get-involved/volunteer");
  await page.type("#name", "E2E Volunteer");
  await page.type("#email", email);
  await page.select("#committee", "Outreach");
  await page.type("#interests", "Helping students find mentors.");
  await page.type("#skills", "Community organising and writing.");
  await page.type("#availability", "3 hours a week");
  await submit();
  await page.waitForFunction(() => document.body.innerText.includes("not an acceptance"), { timeout: 15000 });
  assert.equal(await prisma.volunteerApplication.count({ where: { email } }), 1);
});

await step("mailing list: confirm link activates, a repeat request makes no duplicate, unsubscribe works", async () => {
  for (let i = 0; i < 2; i++) {
    await go("/get-involved/mailing-list");
    await page.type("#email", email);
    await page.click("#consent");
    await submit();
    await page.waitForFunction(() => document.body.innerText.includes("Almost there"), { timeout: 15000 });
  }
  assert.equal(await prisma.mailingSubscriber.count({ where: { email } }), 1);
  assert.equal((await prisma.mailingSubscriber.findUnique({ where: { email } })).status, "PENDING");
  await go(await linkFromEmail("mailing-confirm", email));
  assert.match(await text(), /You.re subscribed/);
  const sub = await prisma.mailingSubscriber.findUnique({ where: { email } });
  assert.equal(sub.status, "ACTIVE");
  assert.ok(sub.consentAt && sub.policyVersion);
  await go(`/get-involved/mailing-list/unsubscribe?token=${sub.unsubscribeToken}`);
  await submit();
  await page.waitForFunction(() => document.body.innerText.includes("unsubscribed"), { timeout: 15000 });
  assert.equal((await prisma.mailingSubscriber.findUnique({ where: { email } })).status, "UNSUBSCRIBED");
});

await step("contact form saves the request and says honestly that the staff alert wasn't sent", async () => {
  await go("/get-involved/contact");
  await page.type("#name", "E2E Contact");
  await page.type("#email", email);
  await page.type("#subject", "Walk-through message");
  await page.type("#message", "Checking that contact requests are stored before success is shown.");
  await submit();
  await page.waitForFunction(() => document.body.innerText.includes("Your message has been"), { timeout: 15000 });
  assert.equal(await prisma.contactRequest.count({ where: { email } }), 1);
  if (!process.env.CONTACT_TO_EMAIL) assert.match(await text(), /couldn.t be sent/);
});

await step("form errors keep what was typed", async () => {
  await go("/get-involved/contact");
  await page.type("#name", "Keeps Input");
  await page.type("#email", email);
  await page.type("#subject", "Hi");
  await page.type("#message", "short");
  await submit();
  await page.waitForSelector(".field-error", { timeout: 15000 });
  assert.equal(await page.$eval("#name", (el) => el.value), "Keeps Input");
  assert.equal(await page.$eval("#message", (el) => el.value), "short");
});

await step("contribution through the sandbox checkout: pending until the webhook, then thanked", async () => {
  await go("/sponsorship/sample-campaign");
  await page.$eval("#email", (el) => (el.value = ""));
  await page.type("#email", email);
  await pause(1700);
  await Promise.all([page.waitForFunction(() => location.pathname.startsWith("/checkout/sandbox/"), { timeout: 20000 }), page.click("form button.gold")]);
  assert.match(await text(), /No real money moves/);
  await Promise.all([page.waitForFunction(() => location.pathname.endsWith("/return"), { timeout: 20000 }), page.click("button[value=success]")]);
  await page.waitForFunction(() => document.body.innerText.includes("Thank you"), { timeout: 20000 });
  const rows = await prisma.contribution.findMany({ where: { donorEmail: email } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "SUCCEEDED");
  assert.equal(await prisma.emailOutbox.count({ where: { toEmail: email, kind: "payment-acknowledgement" } }), 1);
});

await step("scholarships: chosen filters go into the address, survive a reload, and Clear filters resets them", async () => {
  await go("/scholarships");
  assert.match(await text(), /Discover scholarships, fellowships, and grants that support your education, research, and professional growth\./);
  await pause(1700);
  await page.click('input[name="type"][value="fellowship"]');
  await page.click('input[name="level"][value="phd"]');
  await page.select("#country", "GB");
  await page.type("#q", "robotics");
  await page.click("form.funding-form button[type=submit]");
  await page.waitForFunction(() => location.search.includes("search=1"), { timeout: 15000 });
  const params = new URL(page.url()).searchParams;
  assert.deepEqual([params.get("type"), params.get("level"), params.get("country"), params.get("q")], ["fellowship", "phd", "GB", "robotics"]);
  await page.reload({ waitUntil: "networkidle2" });
  const kept = await page.evaluate(() => [document.querySelector('input[name="type"][value="fellowship"]').checked, document.querySelector('input[name="level"][value="phd"]').checked, document.querySelector("#country").value, document.querySelector("#q").value]);
  assert.deepEqual(kept, [true, true, "GB", "robotics"]);
  // With no search key configured the page must say so and show no cards; with one, cards link out.
  const body = await text();
  const cards = await page.$$eval(".opp-card a.button", (links) => links.map((a) => [a.href.startsWith("http"), a.target, a.rel.includes("noopener")]));
  assert.ok(/isn.t available yet|opportunit(y|ies) found|No matching opportunities|couldn.t complete|allowance/.test(body));
  if (/isn.t available yet/.test(body)) assert.equal(cards.length, 0);
  assert.ok(cards.every(([http, target, safe]) => http && target === "_blank" && safe));
  await page.evaluate(() => [...document.querySelectorAll("form.funding-form button")].find((b) => b.textContent === "Clear filters").click());
  await page.waitForFunction(() => location.search === "", { timeout: 15000 });
  await pause(300);
  assert.equal(await page.$eval("#q", (el) => el.value), "");
});

await step("desktop navigation by keyboard: About opens with Enter, has exactly four entries, closes with Escape", async () => {
  // The eight tabs show from 1341px wide; below that the menu button takes over.
  await page.setViewport({ width: 1366, height: 900 });
  await go("/");
  await page.focus("[data-menu=about]");
  await page.keyboard.press("Enter");
  const items = await page.$$eval("#menu-about a", (links) => links.map((a) => a.textContent));
  assert.deepEqual(items, ["About us", "News", "Our team", "Privacy Policy"]);
  await page.keyboard.press("Escape");
  assert.equal(await page.$("#menu-about"), null);
  const tabs = await page.$$eval(".nav-links > .nav-item > a, .nav-links > .nav-item > button:not(.nav-caret)", (els) => els.map((el) => el.textContent.trim()));
  assert.deepEqual(tabs, ["Home", "About", "Get Involved", "Exhibitions", "Discussion", "Mentorship", "Sponsorship", "Scholarships & Funding"]);
});

await step("mobile navigation: collapsible menu with tap-to-expand submenus, no hover needed", async () => {
  await page.setViewport({ width: 375, height: 760, isMobile: true, hasTouch: true });
  await go("/");
  await page.tap(".hamburger");
  await page.waitForSelector(".mobile-nav.open");
  await page.tap(".mobile-nav > div:nth-of-type(1) .mobile-sub-toggle");
  const about = await page.$$eval("#mobile-sub-about a", (links) => links.map((a) => a.textContent));
  assert.equal(about.length, 4);
  await page.tap(".mobile-row .mobile-sub-toggle");
  const involved = await page.$$eval("#mobile-sub-get-involved a", (links) => links.map((a) => a.textContent));
  assert.deepEqual(involved, ["Contribute", "Volunteer", "Join our mailing list", "Contact us"]);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.tap(".mobile-row > a")]);
  assert.equal(new URL(page.url()).pathname, "/get-involved");
});

await browser.close();

// Clean up everything this run created.
const user = await prisma.user.findUnique({ where: { email } });
await prisma.paymentEvent.deleteMany({ where: { contribution: { donorEmail: email } } });
await prisma.contribution.deleteMany({ where: { donorEmail: email } });
await prisma.volunteerApplication.deleteMany({ where: { email } });
await prisma.contactRequest.deleteMany({ where: { email } });
await prisma.mailingSubscriber.deleteMany({ where: { email } });
await prisma.emailOutbox.deleteMany({ where: { toEmail: email } });
if (user) {
  const uploads = await prisma.upload.findMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  const { rm } = await import("node:fs/promises");
  for (const u of uploads) await rm(resolve(".localdata/uploads", u.storageKey), { force: true });
}
await prisma.$disconnect();

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
