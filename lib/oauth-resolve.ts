import {
  findByGoogleSub,
  findByXId,
  findByXHandle,
  findByEmail,
  getUser,
  linkProvider,
  listUsers,
  type User,
} from "@/src/services/auth";
import type { OAuthProfile } from "@/src/services/oauth";
import type { AuthProviderId } from "@/src/services/settings";

// Map a verified OAuth profile to a local admin account. We only admit profiles
// that match an existing admin (by provider id, handle, or email); first match
// gets the provider linked for next time. No silent self-provisioning.
export function resolveOAuthUser(
  provider: AuthProviderId,
  profile: OAuthProfile
): User | null {
  if (provider === "google") {
    const byId = findByGoogleSub(profile.id);
    if (byId) return byId;
    if (profile.email) {
      const byEmail = findByEmail(profile.email);
      if (byEmail) {
        linkProvider(byEmail.id, { googleSub: profile.id });
        return getUser(byEmail.id);
      }
    }
    return null;
  }

  // x
  const byId = findByXId(profile.id);
  if (byId) return byId;
  if (profile.handle) {
    const byHandle = findByXHandle(profile.handle);
    if (byHandle) {
      linkProvider(byHandle.id, { xId: profile.id, xHandle: profile.handle });
      return getUser(byHandle.id);
    }
  }
  return null;
}

// Demo fallback used when a provider has no real credentials configured:
// sign in as the base (first) admin so the flow is demoable end-to-end.
export function demoUser(): User | null {
  const us = listUsers();
  return us.length ? getUser(us[0].id) : null;
}
