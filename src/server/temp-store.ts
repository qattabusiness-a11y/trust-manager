import "server-only";

/**
 * Ephemeral, in-memory holding area for receipt images during processing.
 *
 * - Nothing is written to disk, a database, or object storage.
 * - Every object has a short TTL; a sweeper purges anything left behind
 *   (secondary safeguard if a request crashes before its `finally`).
 * - Buffers are zero-filled before release.
 */

interface TempObject {
  bytes: Uint8Array;
  expiresAt: number;
}

export const TEMP_TTL_MS = 60_000;

const objects = new Map<string, TempObject>();
let sweeper: ReturnType<typeof setInterval> | null = null;

function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(purgeExpired, 15_000);
  // Don't keep the process alive just for the sweeper.
  (sweeper as unknown as { unref?: () => void }).unref?.();
}

export function putTemp(bytes: Uint8Array, ttlMs = TEMP_TTL_MS): string {
  ensureSweeper();
  const id = crypto.randomUUID();
  objects.set(id, { bytes, expiresAt: Date.now() + ttlMs });
  return id;
}

export function getTemp(id: string): Uint8Array | null {
  const obj = objects.get(id);
  if (!obj) return null;
  if (obj.expiresAt < Date.now()) {
    deleteTemp(id);
    return null;
  }
  return obj.bytes;
}

export function deleteTemp(id: string): void {
  const obj = objects.get(id);
  if (obj) obj.bytes.fill(0);
  objects.delete(id);
}

/** Verified deletion: returns true only if the object no longer exists. */
export function deleteTempVerified(id: string): boolean {
  deleteTemp(id);
  return !objects.has(id);
}

export function purgeExpired(): number {
  const now = Date.now();
  let n = 0;
  for (const [id, obj] of objects) {
    if (obj.expiresAt < now) {
      deleteTemp(id);
      n++;
    }
  }
  return n;
}

export function tempObjectCount(): number {
  return objects.size;
}
