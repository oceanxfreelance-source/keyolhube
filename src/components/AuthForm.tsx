"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./Logo";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The button stays disabled until JavaScript runs, so the browser can never submit the form
  // natively (which would put the email and password in the URL).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = mode === "sign-up"
      ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0], email, password })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (r.error) {
      setError(r.error.message ?? "Could not sign in");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} method="post" className="card w-full max-w-sm p-7 space-y-4">
        <Logo />
        <div>
          <h1 className="text-xl font-semibold">{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
          <p className="text-sm text-muted mt-1">{mode === "sign-up" ? "Free. Your designs are saved to your account." : "Sign in to open your designs."}</p>
        </div>
        {mode === "sign-up" && (
          <label className="block space-y-1">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="block space-y-1">
          <span className="label">Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block space-y-1">
          <span className="label">Password</span>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"} />
          {mode === "sign-up" && <span className="text-xs text-muted">At least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !ready}>{busy ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
        <p className="text-sm text-muted text-center">
          {mode === "sign-up" ? <>Have an account? <Link className="text-accent font-medium" href="/sign-in">Sign in</Link></>
            : <>New here? <Link className="text-accent font-medium" href="/sign-up">Create an account</Link></>}
        </p>
      </form>
    </main>
  );
}
