import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge guard for protected app routes:
 *  - no session cookies at all  -> redirect to /login
 *  - access token expired but a refresh cookie exists -> rotate the session
 *    via /api/auth/refresh and continue with fresh cookies (verification of
 *    signatures still happens server-side in layouts/API routes).
 *  - CSRF: state-changing requests must include an allowed Origin / Sec-Fetch-Site.
 */
const PROTECTED = [
  "/dashboard",
  "/pos",
  "/products",
  "/customers",
  "/suppliers",
  "/purchases",
  "/sales",
  "/debts",
  "/inventory",
  "/cash",
  "/reports",
  "/users",
  "/subscription",
  "/admin",
  "/audit",
];

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

function isAllowedOrigin(req: NextRequest): boolean {
  // For same-site requests, Origin is absent on GET navigation but present on POST.
  // We only enforce on state-changing methods; GET/HEAD are safe.
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  // Allow same-origin and same-site; block obvious cross-site forgeries.
  if (site === "same-origin" || site === "same-site" || site === "none") return true;
  if (!origin) return true; // no Origin header on some same-site POSTs (e.g. form without CORS)
  try {
    const host = req.nextUrl.host;
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // CSRF check for protected mutations (defense-in-depth; httpOnly+SameSite=lax is primary).
  if (isProtected && !isAllowedOrigin(req)) {
    return new NextResponse(JSON.stringify({ ok: false, error: "طلب مرفوض (CSRF)", code: "CSRF_BLOCKED" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isProtected) return NextResponse.next();

  const hasRefresh = req.cookies.has("meqwat_rt");
  const hasAccess = req.cookies.has("meqwat_at");
  if (!hasRefresh && !hasAccess) {
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
      // Refresh failed — clear stale cookies and redirect to login with reason.
      if (res.status === 401) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "expired");
        const response = NextResponse.redirect(url);
        response.cookies.delete("meqwat_at");
        response.cookies.delete("meqwat_rt");
        return response;
      }
    } catch {
      // network error — fall through; layout will redirect to /login
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
