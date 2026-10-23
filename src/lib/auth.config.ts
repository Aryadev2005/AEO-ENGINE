import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

const GOOGLE_CLIENT_ID = process.env.AUTH_GOOGLE_ID;
const GOOGLE_CLIENT_SECRET = process.env.AUTH_GOOGLE_SECRET;
export const GOOGLE_CONFIGURED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

/**
 * Edge-safe config: no DB import anywhere in this module's graph. Used
 * directly by proxy.ts (Edge Runtime — can't open a raw TCP Postgres connection) and
 * re-exported from auth.ts (Node runtime) with the DB-backed callbacks added.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(GOOGLE_CONFIGURED
      ? [Google({ clientId: GOOGLE_CLIENT_ID!, clientSecret: GOOGLE_CLIENT_SECRET! })]
      : []),
    // Local-only: lets the app be demoed/developed without a Google OAuth app.
    // Refuses to issue a session once NODE_ENV is "production".
    Credentials({
      id: "dev",
      name: "Dev sign-in (local only)",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        if (process.env.NODE_ENV === "production") return null;
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        if (!email || !email.includes("@")) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  ],
} satisfies NextAuthConfig;
