import { destroySession, getCurrentUser } from "@/lib/auth";
import { ok, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(user, "auth.logout", "user", user.id);
  return ok({ loggedOut: true });
}
