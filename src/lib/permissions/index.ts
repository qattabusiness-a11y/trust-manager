import { ROLE_PERMISSIONS, WRITE_PERMISSIONS } from "@/constants";
import type { HouseholdMember, HouseholdRole, Permission } from "@/types";
import { PERMISSIONS } from "@/types";

export class PermissionError extends Error {
  constructor(public permission: Permission | "own_record" | "member") {
    super(
      permission === "member"
        ? "You are not a member of this household."
        : permission === "own_record"
          ? "You can only change your own records."
          : `You don't have permission to do this (${permission.replace(/_/g, " ")}).`,
    );
    this.name = "PermissionError";
  }
}

/** Role defaults, then owner-configured overrides. Viewers can never receive write permissions. */
export function effectivePermissions(member: Pick<HouseholdMember, "role" | "permissionOverrides" | "status"> | null | undefined): Set<Permission> {
  if (!member || member.status !== "active") return new Set();
  if (member.role === "owner") return new Set(PERMISSIONS);
  const set = new Set<Permission>(ROLE_PERMISSIONS[member.role]);
  for (const [perm, granted] of Object.entries(member.permissionOverrides ?? {}) as [Permission, boolean][]) {
    if (granted) {
      if (member.role === "viewer" && WRITE_PERMISSIONS.includes(perm)) continue;
      if (perm === "manage_members") continue; // owner-only
      set.add(perm);
    } else {
      set.delete(perm);
    }
  }
  return set;
}

export function can(member: Parameters<typeof effectivePermissions>[0], perm: Permission): boolean {
  return effectivePermissions(member).has(perm);
}

export function assertCan(member: Parameters<typeof effectivePermissions>[0], perm: Permission) {
  if (!member) throw new PermissionError("member");
  if (!can(member, perm)) throw new PermissionError(perm);
}

/** Which permissions the owner may toggle for a given role. */
export function configurablePermissions(role: HouseholdRole): Permission[] {
  if (role === "owner") return [];
  return PERMISSIONS.filter((p) => p !== "manage_members" && !(role === "viewer" && WRITE_PERMISSIONS.includes(p)));
}
