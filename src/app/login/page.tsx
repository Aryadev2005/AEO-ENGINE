import { GOOGLE_CONFIGURED } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <LoginForm googleConfigured={GOOGLE_CONFIGURED} callbackUrl={params.callbackUrl ?? "/app"} />
    </div>
  );
}
