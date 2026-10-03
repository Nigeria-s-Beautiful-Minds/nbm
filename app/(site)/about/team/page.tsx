import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/cards";
import { coverUrl, listTeam } from "@/lib/content";
import { initialsFromName } from "@/lib/constants";

export const metadata: Metadata = { title: "Our team", description: "The people who run Nigeria's Beautiful Minds." };

const GROUPS = [["STAFF", "Team"], ["ADVISER", "Advisers"], ["COMMITTEE", "Organising committees"]] as const;

export default async function TeamPage() {
  const members = await listTeam();
  return (
    <div className="accent-about">
      <PageHero accent="accent-about" kicker="About" title="Our team">
        <p className="lede">The people responsible for running NBM, reviewing projects and looking after the community.</p>
      </PageHero>
      <section className="page-section tight">
        <div className="shell">
          {members.length === 0 ? (
            <div className="empty-state">
              <h3>Team profiles are coming</h3>
              <p>We&rsquo;ll introduce the team, advisers and organising committees here once their details are confirmed. We don&rsquo;t list anyone without their agreement.</p>
              <p>Want to help build NBM? <Link href="/get-involved/volunteer">Volunteer with us</Link>.</p>
            </div>
          ) : GROUPS.map(([group, title]) => {
            const people = members.filter((m) => m.group === group);
            if (people.length === 0) return null;
            return (
              <div key={group} className="mt-3">
                <h2>{title}</h2>
                <div className="grid cols-3">
                  {people.map((person) => (
                    <article key={person.id} className="card">
                      <div className="card-media" style={{ aspectRatio: "4 / 3" }}>
                        {person.photoUploadId ? <img src={coverUrl(person.photoUploadId)!} alt={`Portrait of ${person.name}`} loading="lazy" /> : <span aria-hidden="true" style={{ fontSize: "2rem" }}>{initialsFromName(person.name)}</span>}
                      </div>
                      <div className="card-body"><h3>{person.name}</h3><p className="muted small">{person.roleTitle}</p><p>{person.bio}</p></div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
