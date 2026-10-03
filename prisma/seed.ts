// Baseline seed, safe for every environment: the first administrator and DRAFT versions of the
// editable pages. It never overwrites a page that already has a version, and it creates no
// members, projects, donors or team profiles.
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PAGE_DRAFTS } from "./page-drafts";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password || password.length < 10) {
    console.log("Skipping admin seed: set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters.");
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, roles: ["MEMBER", "ADMIN"], emailVerified: new Date() },
      create: { email, name: "NBM Admin", passwordHash, roles: ["MEMBER", "ADMIN"], emailVerified: new Date() }
    });
    console.log(`Seeded administrator: ${email}`);
  }

  for (const page of PAGE_DRAFTS) {
    const existing = await prisma.pageVersion.findFirst({ where: { slug: page.slug } });
    if (existing) continue;
    await prisma.pageVersion.create({ data: { slug: page.slug, version: 1, title: page.title, body: page.body, status: "DRAFT" } });
    console.log(`Seeded draft page: ${page.slug} (needs founder approval before it can be published)`);
  }
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
