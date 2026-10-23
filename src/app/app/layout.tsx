import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AEO Engine";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, session.workspaceId));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app" className="font-semibold">
              {APP_NAME}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/app" className="text-muted-foreground hover:text-foreground">
                Brands
              </Link>
              <Link href="/app/settings" className="text-muted-foreground hover:text-foreground">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{workspace?.name}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
