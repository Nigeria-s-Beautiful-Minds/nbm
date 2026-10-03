// Sample content for development and staging only, so the pages can be seen with something in
// them. Every record is labelled "[Sample]" and authored by the seeded administrator. It
// refuses to run when SITE_STAGE=production, and `--remove` deletes everything it created.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { deleteObject, putObject } from "../lib/storage";

const prisma = new PrismaClient();
const TAG = "[Sample]";

async function remove() {
  const media = await prisma.upload.findMany({ where: { storageKey: { startsWith: "exhibitions/sample-" } } });
  await prisma.newsArticle.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.exhibition.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.upload.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  for (const m of media) await deleteObject(m.storageKey);
  await prisma.audioRoom.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.thread.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.opportunity.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.campaign.deleteMany({ where: { title: { startsWith: TAG }, contributions: { none: {} } } });
  console.log("Sample records removed.");
}

async function main() {
  if (process.env.SITE_STAGE === "production") throw new Error("Refusing to seed sample content: SITE_STAGE is production.");
  if (process.argv.includes("--remove")) return remove();

  const admin = await prisma.user.findFirst({ where: { roles: { has: "ADMIN" } } });
  if (!admin) throw new Error("Run `npm run seed` first to create the administrator.");
  if (await prisma.exhibition.findFirst({ where: { title: { startsWith: TAG } } })) return console.log("Sample content already present. Use `npm run seed:demo -- --remove` to clear it.");

  const now = new Date();
  // One sample project per field, each with its illustration from images/ (compressed into demo-assets/).
  const note = "\n\nThis is a sample post for the staging site, with an illustrative image. Real posts describe the problem, what has been built or found so far, and what help the team is looking for.";
  const posts = [
    { file: "ai-data", topic: "AI & Data", stage: "PROTOTYPE", title: "Mapping service gaps with open data and machine learning", alt: "Illustration: a team analysing data dashboards with a map of Nigeria on a large screen.", description: "Combining public datasets to show where clinics, schools and power are hardest to reach, state by state." },
    { file: "agriculture-food", topic: "Agriculture & Food", stage: "TESTED", title: "Drone and sensor monitoring for smallholder vegetable farms", alt: "Illustration: researchers and a farmer reviewing crop data in a greenhouse while a drone flies overhead.", description: "Low-cost soil sensors and drone images that tell farmers when to water and where pests are starting." },
    { file: "health-biotech", topic: "Health & Biotech", stage: "PROPOSED", title: "Faster malaria diagnostics for primary health centres", alt: "Illustration: scientists working with microscopes and sample tubes in a laboratory.", description: "A proposed study comparing rapid-test results with microscopy in community clinics." },
    { file: "energy-climate", topic: "Energy & Climate", stage: "DEMONSTRATED", title: "Solar mini-grid monitoring for rural communities", alt: "Illustration: engineers checking energy readings beside solar panels and wind turbines.", description: "Remote monitoring that warns operators before batteries and inverters fail." },
    { file: "engineering-robotics", topic: "Engineering & Robotics", stage: "PROTOTYPE", title: "Affordable robotic arms for teaching labs", alt: "Illustration: students assembling small robots and a robotic arm at a workbench.", description: "Open designs for robotic arms built from locally available parts, for polytechnic labs." },
    { file: "software-digital", topic: "Software & Digital", stage: "IN_USE", title: "Offline-first mobile app for market traders", alt: "Illustration: developers writing code with a mobile app design on screen.", description: "Bookkeeping that keeps working without a data connection and syncs when it returns." },
    { file: "environment-water", topic: "Environment & Water", stage: "PROTOTYPE", title: "Real-time water quality monitoring on the lagoon", alt: "Illustration: researchers testing water samples on a lagoon shore beside a solar-powered sensor.", description: "Solar-powered sensors that report water quality so fishing communities can act early." },
    { file: "policy-society", topic: "Policy & Society", stage: "PROPOSED", title: "Evidence briefs for state education policy", alt: "Illustration: a roundtable discussion with a map of Nigeria on a screen.", description: "Short, plain-language research briefs prepared with state officials and teachers." }
  ];
  const exhibitionIds: string[] = [];
  for (const [index, post] of posts.entries()) {
    const key = `exhibitions/sample-${post.file}.jpg`;
    const bytes = await readFile(resolve(__dirname, `demo-assets/${post.file}.jpg`));
    if (!(await putObject(key, bytes, "image/jpeg"))) throw new Error("Storage is not available.");
    const upload = await prisma.upload.create({ data: { userId: admin.id, purpose: "EXHIBITION_MEDIA", storageKey: key, mime: "image/jpeg", size: bytes.length, verifiedAt: now, attached: true } });
    const row = await prisma.exhibition.create({
      data: {
        slug: `sample-${post.file}`, authorId: admin.id, title: `${TAG} ${post.title}`, description: post.description + note, topic: post.topic, stage: post.stage,
        teamCredits: "Sample record", status: "APPROVED", publishedAt: new Date(now.getTime() - index * 3600_000), reviewedById: admin.id, reviewedAt: now, featured: index === 0,
        media: { create: { uploadId: upload.id, kind: "IMAGE", alt: post.alt, width: 1200, height: 900 } }
      }
    });
    exhibitionIds.push(row.id);
  }

  const thread = await prisma.thread.create({
    data: { hostId: admin.id, title: `${TAG} What makes a student research project succeed?`, topic: "Other", body: "This is a sample conversation for the staging site. Hosts open with a specific question; members reply, and the host can lock the thread or remove disruptive replies." }
  });
  await prisma.threadMessage.create({ data: { threadId: thread.id, authorId: admin.id, body: "Sample reply: a clear scope, a committed supervisor and a realistic resource plan.", clientId: "sample-message-0001" } });

  const roomThread = await prisma.thread.create({ data: { hostId: admin.id, title: `${TAG} Open house: meet the NBM coordinators`, topic: "Other", body: "A sample scheduled audio room. Everyone joins as a listener and can ask to speak." } });
  await prisma.audioRoom.create({ data: { hostId: admin.id, threadId: roomThread.id, title: roomThread.title, description: roomThread.body, topic: "Other", startsAt: new Date(now.getTime() + 3 * 24 * 3600_000), timezone: "Africa/Lagos" } });

  await prisma.opportunity.create({
    data: {
      mentorId: admin.id, title: `${TAG} Field validation of low-cost sensors`, topic: "Agriculture & Food", scope: "This is a sample opportunity for the staging site. A real one describes the project, what the student will do, and how the work is supervised.",
      skills: ["Data analysis", "Field work"], learningGoals: "Sample: experimental design, careful measurement and writing up results.", duration: "12 weeks", hoursPerWeek: "6-8 hours", location: "Remote",
      workingMode: "REMOTE", fundingStatus: "UNFUNDED", fundingNote: "Sample record: no funding attached.", capacity: 2, status: "PUBLISHED"
    }
  });

  await prisma.campaign.create({
    data: {
      slug: "sample-campaign", requesterId: admin.id, title: `${TAG} Equipment for a student sensor project`, kind: "PROJECT",
      purpose: "This is a sample campaign for the staging site. No money has been raised and none can be given to it for real. A real campaign explains the problem, the team, the budget and the milestones.",
      team: "Sample record.", beneficiaries: "Sample record.", budget: "Sample: sensors, a data logger and field travel.", currency: "NGN", targetMinor: BigInt(300_000_000),
      targetPolicy: "Sample policy: if the target is missed, funds received are used for the first milestones in order; anything above the target goes to the general programme.",
      status: "OPEN", reviewedById: admin.id,
      milestones: { create: [{ title: "Sensors purchased and installed", amountMinor: BigInt(180_000_000), sortOrder: 0 }, { title: "Field results published", amountMinor: BigInt(120_000_000), sortOrder: 1 }] }
    }
  });

  await prisma.newsArticle.create({
    data: {
      slug: "sample-news-article", title: `${TAG} How news appears on NBM`, category: "Announcements", status: "PUBLISHED", publishedAt: now, authorId: admin.id, linkedExhibitionId: exhibitionIds[0],
      excerpt: "A sample article for the staging site, showing how staff-written news looks and how it links to a project.",
      body: "This is a sample article for the staging site.\n\n## What goes here\n\nNews is written by NBM staff: announcements, community stories, opportunities and events. An article can link to a project in Exhibitions rather than copying it.\n\n- Editors can save drafts and preview them.\n- Only published articles are public."
    }
  });

  console.log("Sample content created (all titles start with [Sample]).");
}

main()
  .catch((error) => { console.error(error.message ?? error); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
