import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Deliberately built from the edge-safe authConfig only (no DB import) —
// this runs on the Edge Runtime, which can't open a raw TCP Postgres connection.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAppRoute = req.nextUrl.pathname.startsWith("/app");
  if (isAppRoute && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/app/:path*"],
};
