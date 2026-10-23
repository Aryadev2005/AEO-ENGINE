"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm({
  googleConfigured,
  callbackUrl,
}: {
  googleConfigured: boolean;
  callbackUrl: string;
}) {
  const [email, setEmail] = useState("demo@aeo-engine.local");
  const [loading, setLoading] = useState(false);

  async function devSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("dev", { email, callbackUrl });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your workspace dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {googleConfigured && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl })}
          >
            Continue with Google
          </Button>
        )}
        {googleConfigured && <Separator />}
        <form onSubmit={devSignIn} className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="email">Email (dev sign-in, local only)</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Continue"}
          </Button>
        </form>
        <p className="text-muted-foreground text-xs">
          No password — this creates (or reuses) a workspace for that email. Local development
          only; disabled in production builds.
        </p>
      </CardContent>
    </Card>
  );
}
