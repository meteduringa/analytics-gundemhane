import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const roleGate: Record<string, string[]> = {
  "/api/analytics/admin": ["ADMIN"],
  "/api/analytics": ["ADMIN", "CUSTOMER"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/analytics/simple")) {
    return NextResponse.next();
  }
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  const matchedPrefix = Object.keys(roleGate).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!matchedPrefix) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowedRoles = roleGate[matchedPrefix];
  const role = (token.role as string | undefined) ?? "CUSTOMER";

  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/analytics/:path*"],
};
