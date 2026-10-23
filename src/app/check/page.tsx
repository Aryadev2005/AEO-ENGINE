import { CheckerWidget } from "@/components/checker/checker-widget";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

export default function CheckPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-16">
        <CheckerWidget turnstileSiteKey={TURNSTILE_SITE_KEY} />
      </main>
      <SiteFooter />
    </div>
  );
}
