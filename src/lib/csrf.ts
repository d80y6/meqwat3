/** Cookie-authenticated browser mutations must originate from the same origin.
 * Native clients have neither Origin nor Fetch Metadata; their explicit cookies
 * are accepted. Browsers reporting cross-site/same-site are never exempted. */
export function allowedMutationOrigin(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if (origin) {
    try {
      const target = new URL(req.url);
      target.host = req.headers.get("host") ?? target.host;
      // The reverse proxy must overwrite forwarded headers, never append untrusted input.
      if (req.headers.get("x-forwarded-proto") === "https") target.protocol = "https:";
      const expected = process.env.APP_ORIGIN || target.origin;
      return new URL(origin).origin === expected;
    } catch { return false; }
  }
  return !site || site === "same-origin" || site === "none";
}
