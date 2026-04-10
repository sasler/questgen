import { auth, isAuthConfigured } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isStaticOrSetup(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

function unconfiguredMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticOrSetup(pathname)) {
    return NextResponse.next();
  }

  // Redirect everything else to /setup when auth is not configured
  const setupUrl = new URL("/setup", req.nextUrl.origin);
  return NextResponse.redirect(setupUrl);
}

const configuredMiddleware = auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Allow auth routes, static assets, and setup page
  if (
    pathname.startsWith("/api/auth") ||
    isStaticOrSetup(pathname)
  ) {
    return NextResponse.next();
  }

  // Allow public pages
  if (pathname === "/" || pathname === "/guide") {
    return NextResponse.next();
  }

  // Protect all other routes
  if (!isLoggedIn) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export default function middleware(req: NextRequest) {
  if (!isAuthConfigured()) {
    return unconfiguredMiddleware(req);
  }
  // configuredMiddleware is only called when auth is configured,
  // so auth() returns a real NextAuth middleware function (not the no-op fallback).
  return (configuredMiddleware as (req: NextRequest) => ReturnType<typeof unconfiguredMiddleware>)(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
