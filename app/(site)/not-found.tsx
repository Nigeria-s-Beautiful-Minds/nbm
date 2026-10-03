import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-section">
      <div className="shell auth-wrap">
        <h1>Page not found</h1>
        <p>That page doesn&rsquo;t exist, has been removed, or isn&rsquo;t available to you.</p>
        <div className="button-row"><Link className="button" href="/">Go to Home</Link><Link className="button secondary" href="/exhibitions">Explore projects</Link></div>
      </div>
    </section>
  );
}
