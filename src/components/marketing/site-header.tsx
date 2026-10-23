import Link from "next/link";
import { Button } from "@/components/ui/button";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "AEO Engine";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground text-sm">
            Pricing
          </Link>
          <Button size="sm" nativeButton={false} render={<Link href="/check" />}>
            Free check
          </Button>
        </nav>
      </div>
    </header>
  );
}
