# Decisions

Recorded as they were made on 2 October 2026. Each can be revisited.

1. **Separate app, same stack.** NBM is its own Next.js project in this folder rather than more
   routes inside the Optimais Labs site. It reuses that site's stack and several of its modules
   (rate limiter, Prisma client, storage wrapper, LiveKit wrapper, upload flow, reaction model,
   polling thread view), rewritten where the NBM guide asks for more.
2. **Separate database.** The Optimais database holds live newsletter, exhibition and discussion
   content. NBM has its own schema and must have its own database. Locally it runs an embedded
   PostgreSQL (`npm run db:dev`); the hosted database is a blocker listed in the checklist.
3. **Seven-tab scope.** Where the concept PDF (five sections, no Home) and the build guide
   disagree, the build guide wins, as it instructs. (An eighth tab was added on 3 October 2026:
   see 19.)
4. **Roles are explicit and combinable.** Editor, moderator, coordinator, finance and
   administrator are separate capabilities (`lib/permissions.ts`). One person can hold several.
   Roles are read from the database on every request, so changes and suspensions apply at once.
5. **Email must be confirmed to take part.** Unconfirmed accounts can sign in and browse but
   cannot post, comment, host, apply or request support.
6. **Mentors see applications only through a match.** Even the mentor whose opportunity was
   applied to cannot read an application until a coordinator proposes the match.
7. **Video is MP4 only for the pilot.** It plays in every supported browser and its real length
   can be read from the stored file on the server. Limits are editable in `/admin/settings`.
8. **Edits to approved posts go through review.** The approved version stays public; the edit is
   held separately until a reviewer approves or rejects it.
9. **Audio roles live in our database; LiveKit carries sound.** Tokens last one minute, are
   scoped to one room and cannot publish unless the database says host or speaker. Speak
   requests go through our server, not client-to-client messages. Nothing is recorded.
10. **Thread updates use short polling (4 s),** paused while the tab is hidden. No realtime
    service to run or pay for during the pilot. Edits and removals by others appear on reload.
11. **One contribution system.** General contributions and campaign sponsorship are the same
    `Contribution` record, differing only in `campaignId`. Money is stored in integer minor units.
12. **Payment provider is not chosen.** A Paystack adapter is written (hosted checkout, signed
    webhook) because NGN is the default currency, but it has not been run against Paystack and
    the founder has not confirmed the receiving organisation. A development sandbox provider
    exercises the same webhook path locally. Real payments need both a provider key and an
    administrator ticking the finance sign-off in settings.
13. **Email is a database queue.** Every message is written to `EmailOutbox` first and delivered
    with retries; a dedupe key stops repeats. With no provider configured, messages wait there.
14. **Policies and About are seeded as drafts.** They show on staging with a "draft" notice and
    are hidden in production until an editor publishes them with the founder's approval.
15. **The Optimais Labs relationship is hidden** until an administrator records the founder's
    confirmation in settings.
16. **Hero image.** `GNBM.png` has its headline baked into the picture. The site uses the map
    portion as the hero background with a real, accessible HTML headline, and the full original
    as the link-preview image.
17. **No dark mode, no Three.js.** The visual guide defines one green-and-white system.
18. **The guide PDFs were moved to `docs/reference/`.** `GNBM.png` stays at the project root.
19. **Scholarships & Funding is a live search, not a database (3 October 2026).** The founder asked
    for an eighth tab. Each search calls a web-search API (Tavily) from the server; nothing is
    scraped from search-engine result pages and no opportunity is stored as an NBM record.
20. **Details are read, not written.** Type, level, field, destination, funding, deadline and
    eligibility are matched from the text the provider returns (`lib/scholarship-extract.ts`). No
    language model rewrites them, so a detail the page does not state shows as "Not specified" and
    is listed under "Could not be verified". A deadline counts only when it follows a deadline
    phrase and carries a year. Filters remove a result only when its own stated details contradict
    them; unknowns stay, flagged.
21. **Official sources first.** University, government and known funder domains rank above other
    sites; known directories and list pages are labelled and rank last. When the same opportunity
    appears twice, the official page is the one kept.
22. **Cost controls.** Results are cached for 12 hours in `SearchCache`; deadline window, sort,
    paging and the expired toggle are applied after the cache and cost nothing. New searches are
    limited to 8 per visitor per 10 minutes and to a site-wide daily number of provider calls.
23. **Hero animation.** `video/NBM_Connect_Animation.mp4` replaces the still. Like `GNBM.png`
    (16), its headline is baked into the picture, so the site uses the map portion behind the
    real HTML headline. It plays once, silently, and rests on its last frame; reduced-motion
    visitors get that frame as a still. The header now runs wider than the page column so eight
    tabs fit, and collapses to the menu button below 1340px.
