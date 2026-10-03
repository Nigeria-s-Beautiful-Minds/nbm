# Architecture

```
Browser ── Next.js 15 (App Router, server components + server actions)
              │
              ├─ NextAuth (email + password, JWT cookie; roles re-read from the DB per request)
              ├─ Prisma ── PostgreSQL            accounts, content, conversation, mentorship, support, operations
              ├─ Object storage                  R2 (private bucket, presigned PUT/GET) · local disk in development
              ├─ LiveKit Cloud                   audio only; rooms, tokens and permissions issued by the server
              ├─ Email (Resend or SMTP)          through the EmailOutbox queue
              └─ Payment provider                hosted checkout + signed webhook (Paystack adapter, dev sandbox)
```

## Data groups (prisma/schema.prisma)

- **Identity**: User (roles[], public profile fields, private phone), AuthToken (hashed, single use), ConsentRecord, Notification
- **Content**: PageVersion (versioned pages and policies), NewsArticle, TeamMember, Upload, Exhibition, ExhibitionMedia, ExhibitionComment, ExhibitionReaction (one per member per post), ExhibitionSave
- **Conversation**: Thread, ThreadMessage (unique author + clientId), AudioRoom, AudioRoomMember, Report, UserBlock
- **Mentorship**: MentorProfile, Opportunity (capacity / filled), MentorshipApplication, Match, Milestone, MatchUpdate
- **Support**: Campaign, CampaignMilestone, CampaignUpdate, Contribution, PaymentEvent (unique provider + event id), Disbursement, SupportEnquiry
- **Operations**: VolunteerApplication, MailingSubscriber, ContactRequest, AuditLog, EmailOutbox, Setting

## Who can do what

| Capability | Roles |
| --- | --- |
| Edit news, team, pages; publish own exhibitions directly | Editor, Administrator |
| Review exhibitions; handle reports; intervene in discussions and rooms | Moderator, Administrator |
| Verify mentors, review opportunities, read applications, propose and close matches | Coordinator, Administrator |
| Review campaigns, see donors, approve milestones, record disbursements, handle enquiries | Finance, Administrator |
| Volunteers, contact requests, mailing list, exports, email queue | Coordinator, Administrator |
| Assign roles, suspend accounts, settings, action history | Administrator |

Checks happen on the server in every page, API route and server action. Middleware only
requires a session for `/admin` and `/account`.

## Environments

| | Local | Staging | Production |
| --- | --- | --- | --- |
| `SITE_STAGE` | staging | staging | production |
| Database | embedded Postgres | dedicated hosted Postgres | dedicated hosted Postgres |
| Storage | `.localdata/uploads` | private R2 bucket | private R2 bucket (separate) |
| Email | queue only | test inbox | authenticated sending domain |
| Audio | LiveKit project | LiveKit project | LiveKit project |
| Payments | dev sandbox | provider test keys | provider live keys + recorded sign-off |
| Indexing | blocked | blocked | allowed for public pages |

Per environment set: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `R2_*`,
`LIVEKIT_*`, `RESEND_API_KEY` or `SMTP_*`, `EMAIL_FROM`, `CONTACT_TO_EMAIL`, `PAYMENT_PROVIDER`,
`PAYSTACK_SECRET_KEY`, `JOBS_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Webhook URL to register
with the payment provider: `<site>/api/payments/webhook/paystack`. The R2 bucket needs CORS
allowing PUT/GET/HEAD from the site's origin.

## Operating cost drivers (to budget and alert on)

- **Audio**: participant-minutes (shown per room at `/admin/moderation`). Caps: 25 people, 5 speakers.
- **Media**: storage and egress. Caps: 5 photos of 10 MB or one 100 MB / 3 minute video per post.
- **Email**: confirmation, reset, notification and acknowledgement volume.
- **Payments**: provider fee per transaction (recorded per contribution).

No pricing was verified for this build. Check each provider's current pricing and set spending
alerts before the beta; do not assume a free tier covers it.

## Deploy and roll back

1. Back up the database.
2. `npx prisma migrate deploy` (migrations are additive; never reset a hosted database).
3. Deploy the build; run `npm run seed` once for the first administrator and draft pages.
4. Smoke-test: sign in, upload, a thread message, a room (if audio is configured), the email queue, provider health.
5. To roll back, redeploy the previous build. Do not reverse a migration that would drop data.
