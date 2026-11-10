/**
 * Remembers an invitation token while someone signs in or registers, so they
 * land back on the invitation instead of being sent to create a new household.
 */
const KEY = "tm:pending-invite";

export function setPendingInvite(token: string | null | undefined) {
  try {
    if (token && /^[0-9a-f]{16,128}$/i.test(token)) window.sessionStorage.setItem(KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function getPendingInvite(): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
