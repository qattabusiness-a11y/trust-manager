"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Api } from "@/lib/data/api";
import type { CollectionKey, Row } from "@/lib/data/collections";
import { useSession } from "./use-session";

export function useList<K extends CollectionKey>(k: K, opts: { includeDeleted?: boolean } = {}) {
  const { api, userId, householdId } = useSession();
  return useQuery({
    queryKey: ["data", k, householdId, userId, opts.includeDeleted ?? false],
    enabled: !!api,
    queryFn: () => api!.list(k, opts) as Promise<Row<K>[]>,
  });
}

/**
 * Run a write through the permission-aware API, then refresh every query.
 * Totals are always re-derived from records — no UI counters to update.
 */
export function useAction() {
  const { api } = useSession();
  const qc = useQueryClient();
  type Vars = { fn: (api: Api) => Promise<unknown>; success?: string };
  const m = useMutation<unknown, Error, Vars>({
    mutationFn: async ({ fn }) => {
      if (!api) throw new Error("Your session is still loading. Try again in a moment.");
      return fn(api);
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["data"] });
      void qc.invalidateQueries({ queryKey: ["session"] });
      if (vars.success) toast.success(vars.success);
    },
    onError: (e) => toast.error(e.message || "Something went wrong."),
  });
  return {
    run: <T,>(fn: (api: Api) => Promise<T>, success?: string) => m.mutateAsync({ fn: fn as Vars["fn"], success }) as Promise<T>,
    pending: m.isPending,
  };
}
