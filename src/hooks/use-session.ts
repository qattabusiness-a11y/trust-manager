"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApi, type Api } from "@/lib/data/api";
import { getStore } from "@/lib/data/runtime";
import { effectivePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";
import type { HouseholdMember, Permission, Profile } from "@/types";

export interface SessionData {
  profile: Profile | null;
  member: HouseholdMember | null;
  memberships: HouseholdMember[];
}

export function useSession() {
  const userId = useAuthStore((s) => s.userId);
  const householdId = useAuthStore((s) => s.householdId);
  const hydrated = useAuthStore((s) => s.hydrated);

  const storeQ = useQuery({ queryKey: ["store"], queryFn: getStore, staleTime: Infinity, gcTime: Infinity });

  const sessionQ = useQuery({
    queryKey: ["session", userId, householdId],
    enabled: hydrated && !!userId && !!storeQ.data,
    queryFn: async (): Promise<SessionData> => {
      const store = storeQ.data!;
      // Both lookups go out together: one network round trip instead of two.
      const [profile, allMemberships] = await Promise.all([
        store.getById("profiles", userId!),
        store.select("householdMembers", { userId: userId! }),
      ]);
      const memberships = allMemberships.filter((m) => m.status === "active" && !m.deletedAt);
      const member = memberships.find((m) => m.householdId === householdId) ?? memberships[0] ?? null;
      return { profile, member, memberships };
    },
  });

  const member = sessionQ.data?.member ?? null;
  const api: Api | null = useMemo(() => {
    if (!storeQ.data || !userId || !sessionQ.data) return null;
    return createApi(storeQ.data, { userId, householdId: member?.householdId ?? null, member });
  }, [storeQ.data, userId, sessionQ.data, member]);

  const perms = useMemo(() => effectivePermissions(member), [member]);

  return {
    hydrated,
    userId,
    householdId: member?.householdId ?? null,
    loading: !hydrated || storeQ.isLoading || (!!userId && sessionQ.isLoading),
    error: storeQ.error ?? sessionQ.error,
    profile: sessionQ.data?.profile ?? null,
    member,
    memberships: sessionQ.data?.memberships ?? [],
    api,
    storeMode: storeQ.data?.mode ?? "local",
    can: (p: Permission) => perms.has(p),
  };
}
