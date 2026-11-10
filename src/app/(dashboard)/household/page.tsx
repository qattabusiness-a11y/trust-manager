"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { Copy, KeyRound, MailPlus, ShieldCheck, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmDialog, ErrorState, LoadingState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/inputs";
import { Badge } from "@/components/ui/misc";
import { PERMISSION_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/constants";
import { useAction, useList } from "@/hooks/use-data";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { configurablePermissions, effectivePermissions } from "@/lib/permissions";
import { initials } from "@/lib/utils";
import { inviteSchema } from "@/lib/validations";
import { INVITE_TTL_DAYS, newInviteToken } from "@/services/auth.service";
import type { HouseholdMember, HouseholdRole, Permission } from "@/types";

export default function HouseholdPage() {
  const s = useSession();
  const members = useList("householdMembers");
  const invites = useList("invitations");
  const households = useList("households");
  const audit = useList("auditLogs");
  const { run, pending } = useAction();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [perms, setPerms] = useState<HouseholdMember | null>(null);
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const [name, setName] = useState<string | null>(null);
  const now = useNow();

  if (s.loading || members.isLoading) return <LoadingState rows={4} />;
  if (members.error) return <ErrorState error={members.error} />;
  const canManage = s.can("manage_members");
  const household = households.data?.[0];
  const active = (members.data ?? []).filter((m) => m.status === "active");
  const pendingInv = (invites.data ?? []).filter((i) => i.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Household Members"
        description="Share the household with family or roommates, and decide exactly what each person can see and do."
        actions={canManage && <Button onClick={() => setInviteOpen(true)}><MailPlus /> Invite member</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle>{household?.name ?? "Household"}</CardTitle><CardDescription>{active.length} member{active.length === 1 ? "" : "s"}. Access is enforced by the data layer (and by database row-level security in production), not just hidden in the interface.</CardDescription></CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {active.map((m) => {
                const eff = effectivePermissions(m);
                const isSelf = m.userId === s.userId;
                return (
                  <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">{initials(m.displayName)}</span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">{m.displayName}{isSelf && <Badge tone="gray">You</Badge>}</p>
                        <p className="truncate text-xs text-muted">{m.email}</p>
                        <p className="mt-1 text-[11px] text-muted">{eff.size} permissions{!eff.has("view_balances") && " · can't see balances"}{!eff.has("view_income") && " · can't see income"}</p>
                      </div>
                    </div>
                    {canManage && m.role !== "owner" ? (
                      <div className="flex items-center gap-2">
                        <Select className="h-9 w-40" value={m.role} onChange={(e) => void run((api) => api.update("householdMembers", m.id, { role: e.target.value as HouseholdRole, permissionOverrides: {} }), `Role changed to ${ROLE_LABELS[e.target.value as HouseholdRole]}.`)} aria-label={`Role for ${m.displayName}`}>
                          {(["admin", "contributor", "viewer"] as const).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => setPerms(m)}><KeyRound /> Permissions</Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(m)} aria-label={`Remove ${m.displayName}`}><UserMinus /></Button>
                      </div>
                    ) : (
                      <Badge tone={m.role === "owner" ? "navy" : "gray"}>{ROLE_LABELS[m.role]}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((r) => (
                <div key={r}><p className="text-sm font-medium">{ROLE_LABELS[r]}</p><p className="text-xs text-muted">{ROLE_DESCRIPTIONS[r]}</p></div>
              ))}
            </CardContent>
          </Card>
          {s.can("manage_settings") && household && (
            <Card>
              <CardHeader><CardTitle>Household name</CardTitle></CardHeader>
              <CardContent className="flex gap-2">
                <Input value={name ?? household.name} onChange={(e) => setName(e.target.value)} aria-label="Household name" />
                <Button variant="outline" disabled={!name || name.trim().length < 2} onClick={() => void run((api) => api.update("households", household.id, { name: name!.trim() }), "Household renamed.")}>Save</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {canManage && (
        <Card>
          <CardHeader><CardTitle>Pending invitations</CardTitle><CardDescription>Invitation links are single-use and expire after {INVITE_TTL_DAYS} days. Only a hash of each link is stored.</CardDescription></CardHeader>
          <CardContent>
            {pendingInv.length === 0 ? <p className="text-sm text-muted">No pending invitations.</p> : (
              <ul className="divide-y divide-line">
                {pendingInv.map((i) => {
                  const expired = new Date(i.expiresAt).getTime() < now;
                  return (
                    <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                      <div className="flex-1"><p className="font-medium">{i.email}</p><p className="text-xs text-muted">{ROLE_LABELS[i.role]} · {expired ? "expired" : `expires ${formatDistanceToNow(new Date(i.expiresAt), { addSuffix: true })}`}</p></div>
                      <Button size="sm" variant="ghost" onClick={() => void run((api) => api.update("invitations", i.id, { status: "revoked" }), "Invitation revoked.")}><Trash2 /> Revoke</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Audit log</CardTitle><CardDescription>Changes to financial records and permissions. Images and passwords are never logged.</CardDescription></CardHeader>
          <CardContent>
            <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
              {[...(audit.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map((a) => {
                const who = (members.data ?? []).find((m) => m.userId === a.actorId)?.displayName ?? "System";
                return (
                  <li key={a.id} className="flex gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="w-32 shrink-0 text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                    <span className="flex-1"><strong>{who}</strong> {a.action}d {a.entity.replace(/([A-Z])/g, " $1").toLowerCase()}{a.changes ? ` (${Object.keys(a.changes).join(", ")})` : ""}{a.note ? ` — ${a.note}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setLink(null); }}>
        <DialogContent title="Invite a household member" description="You'll get a secure link to send them. It expires in 7 days.">
          {link ? (
            <div className="space-y-4">
              <p className="text-sm">Share this link with them. For your security it is shown only once.</p>
              <div className="flex gap-2"><Input readOnly value={link} onFocus={(e) => e.target.select()} /><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copied."); }}><Copy /> Copy</Button></div>
              <p className="text-xs text-muted">Trust Manager does not email invitations. Send this link yourself, for example by WhatsApp or SMS.</p>
            </div>
          ) : (
            <InviteForm pending={pending} onSubmit={async (v) => {
              if (active.some((m) => m.email.toLowerCase() === v.email)) return void toast.error("This person is already a member of your household.");
              if (pendingInv.some((i) => i.email.toLowerCase() === v.email && new Date(i.expiresAt).getTime() > now)) return void toast.error("There is already a pending invitation for this email. Revoke it first to send a new one.");
              const { token, tokenHash, expiresAt } = await newInviteToken();
              await run(async (api) => {
                await api.create("invitations", { householdId: api.actor.householdId!, email: v.email, role: v.role, tokenHash, expiresAt, invitedBy: api.actor.userId, status: "pending", acceptedBy: null });
                await api.audit({ action: "invite", entity: "household_invitations", entityId: null, changes: null, note: `Invited ${v.email} as ${v.role}` });
              }, "Invitation created.");
              setLink(`${window.location.origin}/invite/${token}`);
            }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!perms} onOpenChange={(o) => !o && setPerms(null)}>
        <DialogContent title={`Permissions — ${perms?.displayName}`} description="Start from the role, then switch individual permissions on or off." wide>
          {perms && <PermissionEditor member={perms} pending={pending} onSave={async (overrides) => {
            await run(async (api) => {
              await api.update("householdMembers", perms.id, { permissionOverrides: overrides });
              await api.audit({ action: "permission_change", entity: "household_members", entityId: perms.id, changes: null, note: `Permissions updated for ${perms.displayName}` });
            }, "Permissions saved.");
            setPerms(null);
          }} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove ${removing?.displayName}?`} description="They will immediately lose access to this household. Records they created are kept." confirmLabel="Remove member" danger
        onConfirm={async () => { await run((api) => api.update("householdMembers", removing!.id, { status: "removed" }), "Member removed."); setRemoving(null); }} />
    </div>
  );
}

function InviteForm({ onSubmit, pending }: { onSubmit: (v: z.output<typeof inviteSchema>) => Promise<void>; pending: boolean }) {
  const form = useForm<z.input<typeof inviteSchema>, unknown, z.output<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "contributor" } });
  const role = form.watch("role");
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" {...form.register("email")} /></Field>
      <Field label="Role" hint={ROLE_DESCRIPTIONS[role as HouseholdRole]}>
        <Select {...form.register("role")}><option value="admin">Administrator</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></Select>
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Create invitation</Button></div>
    </form>
  );
}

function PermissionEditor({ member, onSave, pending }: { member: HouseholdMember; onSave: (o: Partial<Record<Permission, boolean>>) => Promise<void>; pending: boolean }) {
  const [overrides, setOverrides] = useState<Partial<Record<Permission, boolean>>>(member.permissionOverrides ?? {});
  const eff = effectivePermissions({ ...member, permissionOverrides: overrides });
  const base = effectivePermissions({ ...member, permissionOverrides: {} });
  return (
    <div className="space-y-4">
      {member.role === "viewer" && <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">Viewers can never edit records, so editing permissions aren&apos;t available for this role.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {configurablePermissions(member.role).map((p) => (
          <div key={p} className="rounded-xl border border-line p-3">
            <Switch
              checked={eff.has(p)}
              onChange={(v) => setOverrides((o) => {
                const next = { ...o };
                if (v === base.has(p)) delete next[p]; else next[p] = v;
                return next;
              })}
              label={PERMISSION_LABELS[p]}
              description={eff.has(p) !== base.has(p) ? "Changed from role default" : "Role default"}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOverrides({})}>Reset to role defaults</Button>
        <Button loading={pending} onClick={() => void onSave(overrides)}>Save permissions</Button>
      </div>
    </div>
  );
}
