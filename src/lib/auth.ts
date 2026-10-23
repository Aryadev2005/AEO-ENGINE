import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { db, schema } from "../db/client";
import { authConfig } from "./auth.config";

export { GOOGLE_CONFIGURED } from "./auth.config";

/**
 * Finds or creates the user, and finds or creates their first workspace
 * (owner role) on first sign-in. v1 assumes one active workspace per user —
 * multi-workspace switching can come later without a schema change, since
 * memberships already supports many-to-many.
 */
async function resolveUserAndWorkspace(
  email: string,
  name?: string | null,
  image?: string | null,
): Promise<{ userId: string; workspaceId: string; role: "owner" | "member" }> {
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    const id = randomUUID();
    await db.insert(schema.users).values({ id, email, name: name ?? null, image: image ?? null });
    [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  }

  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id));

  if (membership) {
    return { userId: user.id, workspaceId: membership.workspaceId, role: membership.role };
  }

  const workspaceId = randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: `${name ?? email.split("@")[0]}'s Workspace`,
  });
  await db.insert(schema.memberships).values({
    id: randomUUID(),
    userId: user.id,
    workspaceId,
    role: "owner",
  });

  return { userId: user.id, workspaceId, role: "owner" };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const ctx = await resolveUserAndWorkspace(user.email, user.name, user.image);
        token.userId = ctx.userId;
        token.workspaceId = ctx.workspaceId;
        token.role = ctx.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
      }
      session.workspaceId = token.workspaceId as string;
      session.role = token.role as "owner" | "member";
      return session;
    },
  },
});
