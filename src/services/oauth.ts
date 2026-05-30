import { randomBytes, createHash } from "crypto";
import { getAuthConfig, type AuthProviderId } from "./settings";

// Pending OAuth flows keyed by `state`. In-memory is fine: short-lived, single process.
interface Pending {
  provider: AuthProviderId;
  codeVerifier: string;
  createdAt: number;
}
const pending = new Map<string, Pending>();
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 min

function sweepPending() {
  const now = Date.now();
  for (const [k, v] of pending.entries()) {
    if (now - v.createdAt > PENDING_TTL_MS) pending.delete(k);
  }
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface OAuthProfile {
  // provider-specific stable id
  id: string;
  email?: string;
  handle?: string;
}

export function isConfigured(provider: AuthProviderId): boolean {
  const cfg = getAuthConfig();
  return !!cfg[provider].clientId && !!cfg[provider].clientSecret;
}

function redirectUri(provider: AuthProviderId): string {
  const base = getAuthConfig().baseUrl.replace(/\/$/, "");
  return `${base}/auth/${provider}/callback`;
}

// Build the provider authorize URL and stash the pending state. Returns null if
// the provider isn't configured (caller falls back to demo sign-in).
export function buildAuthUrl(provider: AuthProviderId): string | null {
  if (!isConfigured(provider)) return null;
  sweepPending();
  const cfg = getAuthConfig();
  const state = base64url(randomBytes(16));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest()
  );
  pending.set(state, { provider, codeVerifier, createdAt: Date.now() });

  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: cfg.google.clientId,
      redirect_uri: redirectUri("google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // x (Twitter) OAuth 2.0 with PKCE
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.x.clientId,
    redirect_uri: redirectUri("x"),
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// Exchange the callback code for a verified profile. Throws on any failure.
export async function handleCallback(
  provider: AuthProviderId,
  code: string,
  state: string
): Promise<OAuthProfile> {
  const p = pending.get(state);
  if (!p || p.provider !== provider) throw new Error("invalid or expired state");
  pending.delete(state);
  const cfg = getAuthConfig();

  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.google.clientId,
        client_secret: cfg.google.clientSecret,
        code,
        code_verifier: p.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri("google"),
      }),
    });
    if (!tokenRes.ok) throw new Error(`google token exchange failed: ${tokenRes.status}`);
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("google: no access token");
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) throw new Error(`google userinfo failed: ${infoRes.status}`);
    const info = (await infoRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
    };
    return { id: info.sub, email: info.email_verified ? info.email : undefined };
  }

  // x (Twitter)
  const basic = Buffer.from(`${cfg.x.clientId}:${cfg.x.clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri("x"),
      code_verifier: p.codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`x token exchange failed: ${tokenRes.status}`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("x: no access token");
  const meRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error(`x users/me failed: ${meRes.status}`);
  const me = (await meRes.json()) as { data?: { id: string; username?: string } };
  if (!me.data?.id) throw new Error("x: no user id");
  return { id: me.data.id, handle: me.data.username };
}
