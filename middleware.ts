import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "admincoop_session";
const PORTAL_SESSION_COOKIE = "admincoop_portal_session";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/portal-cliente/login" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/automatizaciones/ciclo" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/portal-cliente")) {
    const hasPortalSession = Boolean(request.cookies.get(PORTAL_SESSION_COOKIE)?.value);
    if (!hasPortalSession) {
      const portalLoginUrl = new URL("/portal-cliente/login", request.url);
      return NextResponse.redirect(portalLoginUrl);
    }

    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
