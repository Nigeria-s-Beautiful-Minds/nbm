// First drafts of the editable pages, written from the NBM concept and from what this codebase
// actually does. They are seeded as DRAFT: the founder must review, correct and publish them
// (the policies after appropriate review) at /admin/content before launch.

export const PAGE_DRAFTS: { slug: string; title: string; body: string }[] = [
  {
    slug: "about",
    title: "About us",
    // Supplied by the founder on 2 October 2026.
    body: `## Our Mission

At **Nigeria’s Beautiful Minds (NBM)**, we believe that the future of Nigeria and Africa depends on our ability to nurture talent, advance impactful research, and turn bold ideas into transformative innovations.

Our mission is to connect Nigerians at home and abroad—students, researchers, innovators, and professionals—to share knowledge, collaborate, and develop solutions to the challenges facing our communities. Through project exhibitions, open conversations, mentorship, and sponsorship, we help promising ideas grow into meaningful research and practical innovations.

We place young and emerging researchers at the heart of this mission, connecting them with established researchers, principal investigators, and the resources they need to learn, build, and contribute to national and continental development.

## Our Vision

We envision a Nigeria and an Africa that compete confidently on the global stage—advancing knowledge, creating technologies, building strong industries, and delivering a better quality of life for their people.

Beginning with Nigeria, we aspire to build a community that brings local knowledge and global expertise together to strengthen Africa’s capacity to innovate and lead across disciplines and sectors. We see a future where opportunity is not limited by geography or background, where research informs progress, and where African ideas and inventions help shape the world.`
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    body: `This policy describes the personal data the NBM website collects and how it is used. **It is a draft for the founder to review and have checked before publication.** The organisation's legal name, address and contact point for data requests still need to be added.

## What we collect

- **Account details**: your name, email address and a password (stored only as a one-way hash). Optionally: the kind of member you are, your city and country, institution, interests, a short biography and a phone number.
- **What you publish**: exhibition posts with their photos or video, comments, reactions, saved posts, discussion messages, and audio rooms you host.
- **Mentorship**: mentor details you submit; applications (interests, experience, motivation, goals, availability, location and an optional CV or portfolio); matches, project briefs, milestones and progress updates.
- **Support**: support requests you submit; for contributions, your email, an optional name, the amount, currency and the payment provider's references. We do not receive or store card details.
- **Forms**: volunteer applications, contact messages, support enquiries and mailing-list subscriptions, including when and how you consented.
- **Audio rooms**: who joined a room, in what role, and for how long. **Audio is not recorded.**
- **Technical data**: a sign-in cookie that keeps you logged in; your IP address, used briefly in memory to limit abuse; and records of moderation and staff actions.

We do not use advertising or third-party analytics trackers.

## How we use it

- To run your account and show your public profile and posts. Your email address and phone number are never shown publicly.
- To review posts, handle reports and keep the community safe.
- To review mentorship applications and propose matches. Applications are private: coordinators can read them, and a mentor can read one only when a coordinator proposes a match with them.
- To process contributions, send payment acknowledgements and account for funds.
- To send emails you need (confirmation, password reset, moderation, match and payment notices) and optional ones you can switch off in your account settings.
- To send the mailing list only to people who confirmed a subscription. Having an account does not subscribe you.

## Who we share it with

Service providers that run the site on our behalf: hosting, the database, media storage, email delivery, the live-audio service (which carries audio in real time) and the payment provider. The specific providers will be listed here before launch. We do not sell personal data.

## How long we keep it

- Account and published content: until you delete it or close your account.
- Uploads that were started but never attached to a post: deleted automatically after about a day.
- Applications, volunteer and contact records: retention periods to be confirmed by the founder.
- Contribution and disbursement records: kept as long as financial record-keeping requires, even after an account is closed.

## Your choices

You can edit your profile, change notification settings, unsubscribe from the mailing list with the link in any email, withdraw a mentorship application, and delete your own posts. To request a copy of your data, a correction, or deletion of your account, contact us through the Contact us page.

## Children

NBM is intended for adults and university-level students. The minimum age for an account is to be confirmed by the founder before launch.

## Changes

Each version of this policy is kept with its effective date. We record which version was current when you joined or subscribed.`
  },
  {
    slug: "terms",
    title: "Terms of use",
    body: `**Draft for the founder to review and have checked before publication.**

## Using NBM

By creating an account you agree to these terms and to the community standards. You are responsible for what you post and for keeping your password safe.

## Your content

You keep the rights to what you post. You give NBM permission to display it on the platform. Only post work you have the right to share, and credit the people who contributed to it. Posts from members are reviewed before publication and may be declined or removed, with a reason.

## Honest claims

Say plainly what stage your work has reached: proposed, demonstrated or tested. Do not present plans as results.

## Mentorship

A match made through NBM is an introduction and a working agreement between two people. It is not an offer of admission, employment, funding or publication, and a technical mentor is not automatically a university supervisor. Each team should agree supervision, authorship, intellectual property and data access before work begins.

## Contributions and sponsorship

Contributions are taken through a hosted payment provider. A payment acknowledgement is not a tax receipt. NBM is not an investment or equity marketplace: supporting a campaign does not give you a share in a project. Refund rules are to be confirmed by the founder before payments go live.

## Audio rooms

Audio rooms are not recorded by NBM. Do not record other participants without their agreement.

## Ending accounts

We may suspend an account that breaks these terms or the community standards. You can close your account at any time by contacting us.`
  },
  {
    slug: "community-standards",
    title: "Community standards",
    body: `**Draft for the founder to review before publication.**

NBM should feel intellectually curious, welcoming and useful. These standards apply equally to everyone, from first-year students to established professors.

## What we ask of you

- **Be generous with early work.** Unfinished prototypes, early ideas and negative results are welcome. Critique the work, not the person.
- **Be honest about evidence.** Label what is proposed, what has been demonstrated and what has been tested.
- **Give credit.** Name collaborators and sources. Do not post someone else's work as your own.
- **Stay on purpose.** Conversations are for questions, findings, lessons and collaboration requests.
- **Respect privacy.** Do not share other people's personal details, private messages or application materials.

## What is not allowed

- Harassment, threats, hate speech or sexual content.
- Spam, scams, or misleading claims about funding, results or affiliations.
- Unsafe content, including instructions that could cause serious harm.
- Using the platform to solicit investment or sell equity.

## Hosts

If you host a conversation or an audio room, you can lock your own conversation, remove disruptive messages in it, decide who speaks in your room, and mute or remove participants. You cannot turn on someone else's microphone, and you have no control over other hosts' conversations.

## Blocking

Blocking someone hides their messages from you and stops them posting in conversations and rooms you host or commenting on your projects. It does not stop them reading public pages, and in other people's public conversations they can still see what you post. If someone is abusing the platform, report them as well.

## What moderators do

Reports go to our moderators, who can remove content, lock or archive conversations, end audio rooms and suspend accounts. Removals are recorded with a reason, and the author is told why.`
  }
];
