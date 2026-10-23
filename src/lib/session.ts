import { NextResponse } from "next/server";
import { auth } from "./auth";

/** Convenience for route handlers: returns either the session or a 401 response to return directly. */
export async function requireSessionOrResponse() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, response: null };
}
