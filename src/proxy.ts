import { auth, isAuthConfigured } from "@/lib/auth";
import { getE2EBypassSession } from "@/lib/auth-utils";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/auth/error" ||
    pathname === "/guide" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
}

function unconfiguredProxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}

const configuredProxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth") || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export default function proxy(req: NextRequest) {
  if (getE2EBypassSession(req)) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    return unconfiguredProxy(req);
  }

  return (configuredProxy as (req: NextRequest) => ReturnType<typeof unconfiguredProxy>)(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
