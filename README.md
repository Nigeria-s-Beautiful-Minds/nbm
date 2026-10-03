# Nigeria's Beautiful Minds (NBM)

A Nigeria-first community for research, innovation and collaboration. Eight tabs: Home, About,
Get Involved, Exhibitions, Discussion, Mentorship, Sponsorship, Scholarships & Funding. Staff tools live under `/admin`.

Built on the same stack as the Optimais Labs site (Next.js 15 App Router, NextAuth, Prisma +
PostgreSQL, Cloudflare R2, LiveKit, plain CSS), with its own database, storage and settings.
The specification is in `docs/reference/`; progress and blockers are in `docs/build-checklist.md`.

## Run it locally

```bash
npm install
npm run db:dev          # terminal 1: local PostgreSQL on port 54329 (data in .localdata/pg)
npx prisma migrate deploy
npm run seed            # administrator (ADMIN_EMAIL / ADMIN_PASSWORD in .env) + draft pages
npm run seed:demo       # optional: labelled "[Sample]" content; `-- --remove` clears it
npm run dev             # terminal 2: http://localhost:4174
```

Copy `.env.example` to `.env` first if you are setting up a new machine. With nothing else
configured, uploads go to `.localdata/uploads`, emails wait in the queue (read them at
`/admin/email`), and contributions use a test checkout that moves no money.

## Check it

```bash
npm run typecheck
npm test                # permissions, mentorship state rules, payment deduplication, scholarship search (needs dev server)
npm run test:browser    # form journeys in a real browser (needs dev server)
npm run screenshots -- --auth   # desktop, tablet and mobile captures in .tmp/screenshots (last 5 runs kept)
npm run build
```

On a busy machine the browser journeys can time out against `npm run dev` (pages compile on first
visit). Run them against the built site instead: `npm run build && npm start`, then `npm run test:browser`.

## Where things are

| Path | What |
| --- | --- |
| `app/(site)/` | Public and member pages |
| `app/admin/` | Staff tools, one page per responsibility |
| `app/api/` | Uploads, media, reactions, comments, messages, audio rooms, payment webhook, jobs |
| `lib/` | Business rules. `permissions.ts` (who can do what), `exhibitions.ts`, `discussions.ts`, `rooms.ts`, `mentorship.ts`, `sponsorship.ts`, `payments.ts`, `mailer.ts`, `storage.ts` |
| `lib/scholarships.ts`, `lib/scholarship-extract.ts`, `lib/search-provider.ts` | Scholarships & Funding: cache and limits, reading results, the search API |
| `lib/actions/` | Server actions behind the forms |
| `prisma/` | Schema, migrations, seeds |
| `docs/` | Checklist, architecture, decisions |

## Scholarships & Funding search

`/scholarships` runs a live web search through the Tavily search API and shows only what the
returned pages state. It needs `TAVILY_API_KEY` in the environment; without it the page says the
search is not switched on and shows nothing. To try the whole flow without a key or any cost:

```bash
npx tsx tests/mock-search-provider.ts     # labelled "[Test fixture]" records on example domains
TAVILY_API_KEY=test-key SCHOLARSHIP_SEARCH_ENDPOINT=http://127.0.0.1:4599 npm run dev
```

## Scheduled job

Call `npm run jobs` (or `POST /api/jobs` with `Authorization: Bearer $JOBS_SECRET`) every five
minutes in staging and production. It retries queued email, deletes abandoned uploads, closes
audio rooms whose host never returned and expires unanswered match offers.

## Deploying

Not deployed yet. See "Blocked on founder input or access" in `docs/build-checklist.md` for
what is needed, and `docs/architecture.md` for the environment checklist and rollback notes.
Never point this app at the Optimais Labs database.
