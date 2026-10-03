"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      setError(
        result.error === "RATE_LIMITED"
          ? "Too many attempts. Please wait a few minutes and try again."
          : result.error === "SUSPENDED"
            ? "This account has been suspended. Contact us if you think this is a mistake."
            : "Incorrect email or password. Please check and try again."
      );
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field-wrap full">
        <label htmlFor="email">Email</label>
        <input id="email" className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field-wrap full">
        <label htmlFor="password">Password</label>
        <input id="password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="full form-actions">
        <button className="button" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </div>
      {error && <p className="status error full" role="alert">{error}</p>}
    </form>
  );
}
