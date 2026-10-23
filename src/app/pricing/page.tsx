import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { PricingClient } from "./pricing-client";

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h1 className="mb-2 text-center text-3xl font-bold">Pricing</h1>
          <p className="text-muted-foreground mb-10 text-center">
            Payments aren&apos;t live yet — every plan books a call or joins the waitlist.
          </p>
          <PricingClient />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
