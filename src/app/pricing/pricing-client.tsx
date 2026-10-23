"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Plan {
  id: string;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  cta: string;
}

const PLANS: Record<"india" | "global", Plan[]> = {
  india: [
    { id: "audit", name: "Audit", price: "₹4,999", cadence: "one-time", blurb: "A one-time AI visibility audit with a fix list.", cta: "Book a call" },
    { id: "starter", name: "Starter", price: "₹2,499", cadence: "/mo", blurb: "Weekly scans, fix list, review tools.", cta: "Join waitlist" },
    { id: "growth", name: "Growth", price: "₹15,000+", cadence: "/mo", blurb: "Done-for-you: we implement the fixes for you.", cta: "Talk to us" },
  ],
  global: [
    { id: "starter", name: "Starter", price: "$49", cadence: "/mo", blurb: "Weekly scans, fix list, review tools.", cta: "Join waitlist" },
    { id: "pro", name: "Pro", price: "$149", cadence: "/mo", blurb: "Daily scans, more brands, priority support.", cta: "Join waitlist" },
    { id: "agency", name: "Agency", price: "$399", cadence: "/mo", blurb: "Multi-client, white-labelled reports.", cta: "Talk to us" },
  ],
};

export function PricingClient() {
  const [region, setRegion] = useState<"india" | "global">("india");
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!openPlan) return;
    setLoading(true);
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          email,
          utm: { plan: openPlan.id, region },
        }),
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  function closeDialog() {
    setOpenPlan(null);
    setSubmitted(false);
    setBusinessName("");
    setEmail("");
  }

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <Tabs value={region} onValueChange={(v) => setRegion(v as "india" | "global")}>
          <TabsList>
            <TabsTrigger value="india">India (₹)</TabsTrigger>
            <TabsTrigger value="global">Global ($)</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS[region].map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.blurb}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.cadence}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant={plan.id === "pro" || plan.id === "starter" ? "default" : "outline"} onClick={() => setOpenPlan(plan)}>
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Dialog open={openPlan !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          {!submitted ? (
            <>
              <DialogHeader>
                <DialogTitle>{openPlan?.cta}</DialogTitle>
                <DialogDescription>
                  No payment yet — leave your details and we&apos;ll reach out about the {openPlan?.name} plan.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="pricing-business">Business name</Label>
                  <Input id="pricing-business" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pricing-email">Email</Label>
                  <Input id="pricing-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Sending…" : "Submit"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>You&apos;re on the list</DialogTitle>
                <DialogDescription>We&apos;ll be in touch shortly.</DialogDescription>
              </DialogHeader>
              <Button onClick={closeDialog}>Close</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
