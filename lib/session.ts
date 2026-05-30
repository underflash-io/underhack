import { cookies } from "next/headers";
import {
  getSessionUser,
  sessionCookieName,
  type PublicUser,
  toPublicUser,
} from "@/src/services/auth";

// Server-side current user from the session cookie. Returns null when signed out.
export async function currentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return null;
  const user = getSessionUser(token);
  return user ? toPublicUser(user) : null;
}
