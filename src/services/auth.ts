import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { getDb } from "../db/index";

const SESSION_COOKIE = "underhack_sess";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_N = 16384;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  role: "admin";
  googleSub?: string;
  xId?: string;
  xHandle?: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: "admin";
  googleSub?: string;
  xId?: string;
  xHandle?: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: string;
  google_sub: string | null;
  x_id: string | null;
  x_handle: string | null;
  created_at: string;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    passwordSalt: r.password_salt,
    role: "admin",
    googleSub: r.google_sub ?? undefined,
    xId: r.x_id ?? undefined,
    xHandle: r.x_handle ?? undefined,
    createdAt: r.created_at,
  };
}

export function toPublicUser(u: User): PublicUser {
  const { passwordHash, passwordSalt, ...rest } = u;
  return rest;
}

// --- password hashing (scrypt) ---
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, s, 64, { N: SCRYPT_N }).toString("hex");
  return { hash: derived, salt: s };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  if (!hash || !salt) return false;
  const derived = scryptSync(password, salt, 64, { N: SCRYPT_N }).toString("hex");
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- user store ---
export function listUsers(): PublicUser[] {
  const rows = getDb().prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map((r) => toPublicUser(rowToUser(r)));
}

export function countUsers(): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return r.n;
}

export function getUser(id: string): User | null {
  const r = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function findByEmail(email: string): User | null {
  const r = getDb()
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email.trim()) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function findByGoogleSub(sub: string): User | null {
  const r = getDb().prepare("SELECT * FROM users WHERE google_sub = ?").get(sub) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function findByXId(xId: string): User | null {
  const r = getDb().prepare("SELECT * FROM users WHERE x_id = ?").get(xId) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function findByXHandle(handle: string): User | null {
  const h = handle.replace(/^@/, "");
  const r = getDb()
    .prepare("SELECT * FROM users WHERE x_handle = ? COLLATE NOCASE")
    .get(h) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function createUser(input: {
  email: string;
  password?: string;
  xHandle?: string;
  googleSub?: string;
  xId?: string;
}): PublicUser {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("valid email required");
  if (findByEmail(email)) throw new Error("email already exists");

  let hash = "";
  let salt = "";
  if (input.password) {
    if (input.password.length < 8) throw new Error("password must be at least 8 characters");
    const h = hashPassword(input.password);
    hash = h.hash;
    salt = h.salt;
  }
  const user: User = {
    id: randomUUID().slice(0, 8),
    email,
    passwordHash: hash,
    passwordSalt: salt,
    role: "admin",
    googleSub: input.googleSub,
    xId: input.xId,
    xHandle: input.xHandle?.replace(/^@/, ""),
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, role, google_sub, x_id, x_handle, created_at)
       VALUES (@id, @email, @passwordHash, @passwordSalt, @role, @googleSub, @xId, @xHandle, @createdAt)`
    )
    .run({
      ...user,
      googleSub: user.googleSub ?? null,
      xId: user.xId ?? null,
      xHandle: user.xHandle ?? null,
    });
  return toPublicUser(user);
}

export function deleteUser(id: string): void {
  if (countUsers() <= 1) throw new Error("cannot delete the last admin");
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function linkProvider(
  id: string,
  link: { googleSub?: string; xId?: string; xHandle?: string }
): void {
  const u = getUser(id);
  if (!u) return;
  getDb()
    .prepare("UPDATE users SET google_sub = ?, x_id = ?, x_handle = ? WHERE id = ?")
    .run(
      link.googleSub ?? u.googleSub ?? null,
      link.xId ?? u.xId ?? null,
      (link.xHandle ?? u.xHandle)?.replace(/^@/, "") ?? null,
      id
    );
}

export function authenticatePassword(email: string, password: string): User | null {
  const u = findByEmail(email);
  if (!u) return null;
  return verifyPassword(password, u.passwordHash, u.passwordSalt) ? u : null;
}

// Seed the base admin on first boot. Password from env, or generated + logged.
export function seedBaseAdmin(): void {
  if (countUsers() > 0) return;
  const email = (process.env.ADMIN_EMAIL ?? "admin@underhack.local").toLowerCase();
  let password = process.env.ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = randomBytes(9).toString("base64url");
    generated = true;
  }
  createUser({ email, password });
  console.log(`[auth] seeded base admin: ${email}`);
  if (generated) console.log(`[auth] generated admin password: ${password}`);
}

// --- sessions ---
export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  getDb()
    .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

export function getSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const row = getDb().prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
    | { token: string; user_id: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  return getUser(row.user_id);
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// --- cookies ---
export const sessionCookieName = SESSION_COOKIE;

export function parseCookies(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function serializeSessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
