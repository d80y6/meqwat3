import { destroySession, getCurrentUser } from "@/lib/auth";
import { handler, ok, audit } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(user, "auth.logout", "user", user.id);
  return ok({ loggedOut: true });
});
