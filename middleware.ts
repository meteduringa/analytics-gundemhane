import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const roleGate: Record<string, string[]> = {
  "/api/analytics/admin": ["ADMIN"],
  "/api/analytics": ["ADMIN", "CUSTOMER"],
};

const noStorePrefixes = ["/login", "/panel", "/api/panel"];

const applyNoStoreHeaders = (response: NextResponse) => {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
  return response;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/panel" || pathname.startsWith("/panel/")) {
    const panelSession = request.cookies.get("panel_session")?.value;
    if (!panelSession) {
      const loginUrl = new URL("/login", request.url);
      return applyNoStoreHeaders(NextResponse.redirect(loginUrl));
    }
  }

  const shouldDisableCache = noStorePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (pathname.startsWith("/api/analytics/simple")) {
    return shouldDisableCache
      ? applyNoStoreHeaders(NextResponse.next())
      : NextResponse.next();
  }
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  const matchedPrefix = Object.keys(roleGate).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!matchedPrefix) {
    return shouldDisableCache
      ? applyNoStoreHeaders(NextResponse.next())
      : NextResponse.next();
  }

  if (!token) {
    return applyNoStoreHeaders(
      NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    );
  }

  const allowedRoles = roleGate[matchedPrefix];
  const role = (token.role as string | undefined) ?? "CUSTOMER";

  if (!allowedRoles.includes(role)) {
    return applyNoStoreHeaders(
      NextResponse.json({ error: "Forbidden." }, { status: 403 })
    );
  }

  return shouldDisableCache
    ? applyNoStoreHeaders(NextResponse.next())
    : NextResponse.next();
}

export const config = {
  matcher: ["/login", "/panel/:path*", "/api/panel/:path*", "/api/analytics/:path*"],
};
