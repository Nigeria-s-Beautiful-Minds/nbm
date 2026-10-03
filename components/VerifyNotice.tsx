import Link from "next/link";

export function VerifyNotice({ what }: { what: string }) {
  return (
    <div className="notice warn">
      <p>Please confirm your email address before you {what}. We sent a link when you joined; you can request a new one from your <Link href="/account/settings">account settings</Link>.</p>
    </div>
  );
}
