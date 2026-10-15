import { allowedMutationOrigin } from "./lib/csrf";
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // CSRF check for protected mutations (defense-in-depth; httpOnly+SameSite=lax is primary).
  if ((isProtected || pathname.startsWith("/api/")) && !allowedMutationOrigin(req)) {
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
        // Refresh cookies must also reach the current server-rendered request.
        const requestHeaders = new Headers(req.headers);
        const pairs = new Map((req.headers.get("cookie") ?? "").split(";").filter(Boolean).map(c => {
          const i = c.indexOf("="); return [c.slice(0, i).trim(), c.slice(i + 1)];
        }));
        for (const c of setCookies) {
          const pair = c.split(";")[0]; const i = pair.indexOf("=");
          pairs.set(pair.slice(0, i), pair.slice(i + 1));
        }
        requestHeaders.set("cookie", [...pairs].map(([k,v]) => `${k}=${v}`).join("; "));
        const response = NextResponse.next({ request: { headers: requestHeaders } });
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
