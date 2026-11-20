import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, schema } from "./db";

type Auth = ReturnType<typeof makeAuth>;

function makeAuth(db: Awaited<ReturnType<typeof getDb>>) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    // Email + password, no email service connected yet: so no verification or reset emails.
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    // Extra site addresses allowed to sign in (comma-separated), e.g. a custom domain.
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [nextCookies()],
  });
}

const g = globalThis as unknown as { __auth?: Promise<Auth> };
export function getAuth(): Promise<Auth> {
  g.__auth ??= getDb().then(makeAuth).catch((e) => { g.__auth = undefined; throw e; });
  return g.__auth;
}

export type SessionUser = { id: string; name: string; email: string };

export async function currentUser(headers: Headers): Promise<SessionUser | null> {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers });
  return s ? { id: s.user.id, name: s.user.name, email: s.user.email } : null;
}
