# Build checklist

Status as of 2 October 2026, against `docs/reference/NBM_Website_A_to_Z_Build_Guide.pdf`.
"Verified locally" means exercised on the running local app by `npm test` (21 checks),
`npm run test:browser` (11 journeys) or the screenshot review. Nothing has been deployed.

## Complete and verified locally

- **Phase 0–1**: audit of the Optimais code, architecture, decisions, `.env.example`, reproducible local setup.
- **Phase 2**: versioned migration (38 tables), registration, email confirmation, sign-in/out, password recovery, rate limits, role-based permissions enforced on the server. Tested with two unrelated members, a reviewer and a visitor.
- **Phase 3**: header with About dropdown (exactly four entries), clickable Get Involved with its own dropdown, mobile collapsible menu with tap-to-expand submenus, footer, buttons, forms that keep input after errors, cards, dialogs, pagination, empty/error/success states. No horizontal overflow at 375, 820 or 1366 px on 24 pages.
- **Phase 4**: Home built from published records only (modules hide when empty), About, searchable and filterable News with drafts and previews, Team with an honest empty state, versioned policy pages with effective dates.
- **Phase 5**: Get Involved landing and four routes; volunteer applications; mailing list with confirmation link, consent time, source and policy version, no duplicates, working unsubscribe; contact form saved before success is shown, with an honest message when the staff alert can't be sent; private staff lists with status and notes; CSV export for authorised staff.
- **Phase 6**: drafts, photo/video upload with progress and retry, alt text, preview, submit, withdraw, delete; server checks of real size, file signature and MP4 duration; private pending media; review queue with approve / reject-with-reason / remove; edits to approved posts held for review; feed with topic filters and pagination; comments with replies; one reaction per member; saves; share links; reports; links to a discussion, opportunity or campaign.
- **Phase 7**: create and browse conversations (recent, active, topic); replies, edit own, remove; retry-safe sends; unsent drafts kept in the browser; polling that recovers after a dropped connection; lock (host), archive (moderator); report and block; written summaries.
- **Phase 9**: mentor onboarding and verification, PI versus technical mentor, opportunities with review, private applications with a dated submitted copy and a private PDF, coordinator matching, mutual acceptance, capacity that can't be exceeded by simultaneous accepts, workspace (brief, milestones, updates), completion, rematch requests.
- **Phase 10 (in the development sandbox)**: support requests and review, campaign pages, one shared contribution flow, webhook signature check, deduplication by event and transaction, out-of-order events, amount and currency mismatch, refunds reducing totals, opt-in donor names, acknowledgement email queued once, institutional and in-kind enquiries that never count as cash, milestone evidence review, disbursements recorded by finance staff only.
- **Phase 11**: staff workspace for every area above, reasons required for rejections, removals and funding changes, action history, email queue with retries and duplicate prevention, in-app notifications with preferences.
- **Phase 12 (partly)**: automated checks for permissions, payment deduplication and state transitions; secrets absent from the client build; sitemap lists only published public pages; staging is closed to crawlers.

## Built but not verified end to end

- **Phase 8, live audio.** All of it is written: server-created rooms, one-minute room-scoped tokens, listener-first joining with no microphone request, request to speak, approve / decline / demote / mute / remove / end applied to LiveKit, blocked rejoin, host-away countdown, idle-room closing, participant-minutes. The permission rules are tested (who may start, join, promote, remove, end). **No audio has been connected**: the LiveKit secret was empty in the Optimais `.env`, so the three-browser host/listener/speaker test, reconnect, and capacity check in the guide have not been run. Do not treat audio as complete.
- **Paystack.** The adapter follows Paystack's hosted-checkout and webhook-signature scheme from memory of its documentation. It has not been checked against the current docs or run in Paystack's test mode. Refund and dispute payload shapes in particular need confirming.
- **Email delivery.** The queue, retries and templates work; no real provider was configured, so nothing has arrived in a real inbox.
- **Cloudflare R2.** The R2 path is the one the Optimais site uses, but NBM has only been run against local disk storage.

- **Scholarships & Funding (added 3 October 2026).** Tab, page, filter form, result cards, sorting, "Load more", loading / empty / error states, cache, rate limit and daily cap are built. Verified locally against a mock provider (`npm test`, 17 checks; browser walk-through; screenshots in light and dark at three widths) and with a real Tavily key in the local `.env`: one search (fully funded master's scholarships in the UK for Nigerian applicants) returned university and funder pages first, directories last, with expired entries hidden. **Only that one real search has been reviewed.** On pages that list several awards, the deadline and funding shown may belong to a different award on the same page; such cards are flagged, but accuracy across other filters has not been measured. The key is not yet set on any hosted environment.

## Not started

- Stronger sign-in (two-factor) for staff accounts.
- Malware scanning of uploads (only type, signature, size and duration are checked).
- CAPTCHA-style bot protection (forms use a hidden field, a timing check and rate limits).
- Recurring contributions (the guide makes these optional).
- Account deletion and data-export self-service (handled by contacting staff for now).
- Shared rate-limit store: limits are per server instance, as on the Optimais site.
- Edits and removals by others appearing live in an open thread (they appear on reload).
- Real-phone, screen-reader and throttled-network checks; backup-restore drill; monitoring and cost alerts.
- Phases 13–14: invited beta, production configuration, deployment, handoff runbook, staff guide.

## Blocked on founder input or access

| Needed | For |
| --- | --- |
| A dedicated PostgreSQL database for NBM (e.g. a new Supabase project) | Any staging or production deployment |
| A private R2 bucket and access keys for NBM | Uploads outside local development |
| LiveKit API secret (the stored one is empty) | Testing and running audio rooms |
| Email provider key or SMTP account and a sending address (Contact us recipient is set: nigeriasbeautifulminds@gmail.com) | All outgoing email |
| Payment decision: receiving organisation, provider, currencies, refund rules, finance owner | Any real contribution |
| Domain and hosting access | Deployment |
| `TAVILY_API_KEY` added to the hosting environment (it is in the local `.env` only), and `npx prisma migrate deploy` | Live Scholarships & Funding search once deployed |
| Review and approval of the Privacy, Terms and Community standards drafts (About us is published with the founder's text); legal name and contact point; minimum age; retention periods | Publishing policies |
| Confirmation of the relationship with Optimais Labs | Showing it on About |
| Real team names, roles, photographs and biographies | The team page |
| Final logo, if different from the interim mark, and real project photography | Brand |
| Named moderators, coordinators, finance owner and mentor reviewers | Staff roles |
| Initial real projects, mentors and campaigns | Launch content (sample records must be removed first: `npm run seed:demo -- --remove`) |
