import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard for protected app routes:
 *  - no session cookies at all  -> redirect to /login
 *  - access token expired but a refresh cookie exists -> rotate the session
 *    via /api/auth/refresh and continue with fresh cookies (verification of
 *    signatures still happens server-side in layouts/API routes).
 */
const PROTECTED = ["/dashboard", "/pos", "/products", "/customers", "/suppliers", "/purchases", "/sales", "/debts", "/inventory", "/cash", "/reports", "/users", "/subscription", "/admin", "/audit"];

function accessExpired(req: NextRequest): boolean {
  const token = req.cookies.get("meqwat_at")?.value;
  if (!token) return true;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    return !payload.exp || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const hasRefresh = req.cookies.has("meqwat_rt");
  if (!hasRefresh && !req.cookies.has("meqwat_at")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasRefresh && accessExpired(req)) {
    try {
      const refreshUrl = new URL("/api/auth/refresh", req.url);
      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });
      if (res.ok) {
        const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
        const response = NextResponse.next();
        for (const c of setCookies) response.headers.append("set-cookie", c);
        return response;
      }
    } catch {
      // fall through — layout will redirect to /login
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
