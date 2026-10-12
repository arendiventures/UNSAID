import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isLoopbackHost, sessionValueFor } from "@/lib/auth";

/**
 * Access control for every page and API route.
 * - No STUDIO_ACCESS_TOKEN: only loopback requests are served (the app binds to 127.0.0.1 anyway).
 * - With STUDIO_ACCESS_TOKEN: a session cookie derived from the token is required; /login issues it.
 */
export async function proxy(req: NextRequest) {
  const token = process.env.STUDIO_ACCESS_TOKEN?.trim();
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host");

  if (!token) {
    if (!isLoopbackHost(host)) {
      return new NextResponse("UNSAID Studio is bound to this machine. Set STUDIO_ACCESS_TOKEN before exposing it on a network.", { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  const expected = await sessionValueFor(token);
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|icon.svg).*)"],
};
