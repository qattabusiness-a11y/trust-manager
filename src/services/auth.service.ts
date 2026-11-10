"use client";

import { isSupabaseConfigured } from "@/config/env";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { getStore } from "@/lib/data/runtime";
import { dayPeriod } from "@/lib/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/utils";
import type { Household, HouseholdInvitation, HouseholdMember, HouseholdRole, Profile } from "@/types";

export interface AuthResult {
  userId: string;
  householdId: string | null;
  onboardingCompleted: boolean;
}

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

function throttle(email: string) {
  const a = attempts.get(email);
  if (a && a.until > Date.now() && a.count >= MAX_ATTEMPTS) {
    throw new Error("Too many attempts. Please wait a minute and try again.");
  }
}
function recordFailure(email: string) {
  const a = attempts.get(email);
  const count = a && a.until > Date.now() ? a.count + 1 : 1;
  attempts.set(email, { count, until: Date.now() + LOCK_MS });
}

async function activeMembership(userId: string, preferred?: string | null): Promise<HouseholdMember | null> {
  const store = await getStore();
  const memberships = (await store.select("householdMembers", { userId })).filter((m) => m.status === "active" && !m.deletedAt);
  return memberships.find((m) => m.householdId === preferred) ?? memberships[0] ?? null;
}

export async function resolveSession(userId: string): Promise<AuthResult | null> {
  const store = await getStore();
  const profile = await store.getById("profiles", userId);
  if (!profile) return null;
  const membership = await activeMembership(userId, profile.defaultHouseholdId);
  return { userId, householdId: membership?.householdId ?? null, onboardingCompleted: profile.onboardingCompleted };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  throttle(normalized);
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) {
      recordFailure(normalized);
      throw new Error("Email or password is incorrect.");
    }
    return (await resolveSession(data.user.id)) ?? { userId: data.user.id, householdId: null, onboardingCompleted: false };
  }
  const store = await getStore();
  const [profile] = await store.select("profiles", { email: normalized });
  const ok = profile?.passwordHash && profile.passwordSalt && (await verifyPassword(password, profile.passwordHash, profile.passwordSalt));
  if (!profile || !ok) {
    recordFailure(normalized);
    throw new Error("Email or password is incorrect.");
  }
  attempts.delete(normalized);
  return (await resolveSession(profile.id))!;
}

export async function register(fullName: string, email: string, password: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email: normalized,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create the account.");
    if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
    return { userId: data.user.id, householdId: null, onboardingCompleted: false };
  }
  const store = await getStore();
  const existing = await store.select("profiles", { email: normalized });
  if (existing.length) throw new Error("An account with this email already exists.");
  const { hash, salt } = await hashPassword(password);
  const now = new Date().toISOString();
  const profile: Profile = {
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    email: normalized,
    fullName: fullName.trim(),
    passwordHash: hash,
    passwordSalt: salt,
    onboardingCompleted: false,
    defaultHouseholdId: null,
  };
  await store.insert("profiles", profile);
  return { userId: profile.id, householdId: null, onboardingCompleted: false };
}

export async function logout() {
  if (isSupabaseConfigured()) await getSupabaseBrowserClient().auth.signOut();
}

/**
 * Creates a household with the caller as owner. In Supabase this runs as the
 * `create_household` SECURITY DEFINER function so the first membership can
 * be written before any RLS permission exists.
 */
export async function createHousehold(
  userId: string,
  input: Pick<Household, "name" | "currency" | "country" | "timezone" | "openingBalance">,
): Promise<string> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseBrowserClient().rpc("create_household", {
      p_name: input.name,
      p_currency: input.currency,
      p_country: input.country,
      p_timezone: input.timezone,
      p_opening_balance: input.openingBalance,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }
  const store = await getStore();
  const profile = await store.getById("profiles", userId);
  if (!profile) throw new Error("Profile not found.");
  const now = new Date().toISOString();
  const householdId = uuid();
  // Tracking starts at the beginning of today (household time), so everything recorded today counts.
  const trackingStart = dayPeriod(input.timezone).start.toISOString();
  await store.insert("households", { id: householdId, createdAt: now, updatedAt: now, deletedAt: null, ownerId: userId, openingBalanceDate: trackingStart, ...input });
  await store.insert("householdMembers", {
    id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, householdId, userId,
    displayName: profile.fullName, email: profile.email, role: "owner", permissionOverrides: {}, status: "active",
  });
  await store.update("profiles", userId, { defaultHouseholdId: householdId, updatedAt: now });
  await store.insert("auditLogs", { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, householdId, actorId: userId, action: "create", entity: "households", entityId: householdId, changes: null, note: "Household created during onboarding" });
  return householdId;
}

/* ------------------------------------------------------------ Invitations */

export const INVITE_TTL_DAYS = 7;

/** Returns the raw token once. Only its SHA-256 hash is stored. */
export async function newInviteToken(): Promise<{ token: string; tokenHash: string; expiresAt: string }> {
  const token = randomToken(24);
  return { token, tokenHash: await sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString() };
}

export async function lookupInvitation(token: string): Promise<(HouseholdInvitation & { householdName: string }) | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseBrowserClient().rpc("lookup_invitation", { p_token: token });
    if (error || !data?.[0]) return null;
    const r = data[0];
    return { id: r.id, householdId: r.household_id, householdName: r.household_name, email: r.email, role: r.role, status: r.status, expiresAt: r.expires_at, tokenHash: "", invitedBy: "", createdAt: "", updatedAt: "" };
  }
  const store = await getStore();
  const [inv] = await store.select("invitations", { tokenHash: await sha256(token) });
  if (!inv) return null;
  const household = await store.getById("households", inv.householdId);
  return { ...inv, householdName: household?.name ?? "Household" };
}

export async function acceptInvitation(token: string, userId: string): Promise<string> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseBrowserClient().rpc("accept_invitation", { p_token: token });
    if (error) throw new Error(error.message);
    return data as string;
  }
  const store = await getStore();
  const [inv] = await store.select("invitations", { tokenHash: await sha256(token) });
  if (!inv) throw new Error("This invitation link is not valid.");
  if (inv.status !== "pending") throw new Error(`This invitation has already been ${inv.status}.`);
  if (new Date(inv.expiresAt).getTime() < Date.now()) {
    await store.update("invitations", inv.id, { status: "expired" });
    throw new Error("This invitation has expired. Ask the household owner for a new one.");
  }
  const profile = await store.getById("profiles", userId);
  if (!profile) throw new Error("Please sign in first.");
  if (profile.email !== inv.email.toLowerCase()) throw new Error(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
  const existing = (await store.select("householdMembers", { householdId: inv.householdId, userId })).find((m) => m.status === "active");
  const now = new Date().toISOString();
  if (!existing) {
    await store.insert("householdMembers", {
      id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, householdId: inv.householdId, userId,
      displayName: profile.fullName, email: profile.email, role: inv.role as HouseholdRole, permissionOverrides: {}, status: "active",
    });
  }
  await store.update("invitations", inv.id, { status: "accepted", acceptedBy: userId, updatedAt: now });
  await store.update("profiles", userId, { defaultHouseholdId: inv.householdId, updatedAt: now });
  await store.insert("auditLogs", { id: uuid(), createdAt: now, updatedAt: now, deletedAt: null, householdId: inv.householdId, actorId: userId, action: "invite", entity: "household_invitations", entityId: inv.id, changes: { status: { from: "pending", to: "accepted" } }, note: "Invitation accepted" });
  return inv.householdId;
}

/* --------------------------------------------------------- Passwords */

/** Sends a password-reset link (Supabase mode). Never reveals whether the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Password reset by email needs the live database. In development mode, use Settings → Reset demo data.");
  const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error && !/rate|limit|seconds/i.test(error.message)) return; // do not leak account existence
  if (error) throw new Error("Please wait a minute before requesting another link.");
}

export async function hasRecoverySession(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return !!data.session;
}

export async function changePassword(newPassword: string, userId?: string | null): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
    return;
  }
  if (!userId) throw new Error("Please sign in first.");
  const store = await getStore();
  const { hash, salt } = await hashPassword(newPassword);
  await store.update("profiles", userId, { passwordHash: hash, passwordSalt: salt, updatedAt: new Date().toISOString() });
}
