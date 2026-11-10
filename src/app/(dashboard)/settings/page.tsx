"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Database, Download, FlaskConical, RotateCcw, Trash2, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, ErrorState, LoadingState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/inputs";
import { Badge } from "@/components/ui/misc";
import { FINANCIAL_GOAL_OPTIONS } from "@/constants";
import { isSupabaseConfigured } from "@/config/env";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useSession } from "@/hooks/use-session";
import { clearLocalData } from "@/lib/data/runtime";
import { cn } from "@/lib/utils";
import { deleteMyAccount, exportMyData } from "@/services/account.service";
import { changePassword } from "@/services/auth.service";
import { registerSchema } from "@/lib/validations";
import { useAuthStore } from "@/stores/auth.store";
import type { UserPersona } from "@/types";

export default function SettingsPage() {
  const s = useSession();
  const personas = useList("personas");
  const prefsQ = useList("preferences");
  const households = useList("households");
  const { run, pending } = useAction();
  const qc = useQueryClient();
  const router = useRouter();
  const signOut = useAuthStore((st) => st.signOut);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const persona = personas.data?.[0] ?? null;
  const prefs = prefsQ.data?.[0] ?? null;
  const household = households.data?.[0] ?? null;

  if (s.loading || personas.isLoading || prefsQ.isLoading) return <LoadingState rows={4} />;
  if (personas.error) return <ErrorState error={personas.error} />;
  const dev = !isSupabaseConfigured();

  async function doExport() {
    const data = await run((api) => exportMyData(api));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trust-manager-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Your data was exported.");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your profile, notifications, data and development tools." />

      {persona ? <ProfileCard key={persona.id} persona={persona} fullName={s.profile?.fullName ?? ""} userId={s.userId!} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>Reminders inside the app are always on.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-navy">Bill reminders, budget warnings and low-balance alerts appear in the bell at the top of every page.</p>
            {dev ? (
              <>
                <Switch checked={!!prefs?.emailNotifications} disabled={!prefs} onChange={(v) => void run((api) => api.update("preferences", prefs!.id, { emailNotifications: v }), "Saved.")} label="Email reminders (simulated)" description="Development mode only — recorded but never actually sent." />
                <Switch checked={!!prefs?.pushNotifications} disabled={!prefs} onChange={(v) => void run((api) => api.update("preferences", prefs!.id, { pushNotifications: v }), "Saved.")} label="Push notifications (simulated)" description="Development mode only — recorded but never actually sent." />
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">Email and phone push reminders are not available yet. Open Trust Manager regularly, or add it to your phone&apos;s home screen, to see your reminders.</p>
            )}
            <Field label="Default reminder days for new bills"><Input value={(prefs?.defaultReminderDays ?? []).join(", ")} readOnly /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Household</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted">Name:</span> {household?.name}</p>
            <p><span className="text-muted">Currency:</span> {household?.currency}</p>
            <p><span className="text-muted">Country:</span> {household?.country}</p>
            <p><span className="text-muted">Time zone:</span> {household?.timezone} — days, weeks (Mon–Sun) and months are calculated in this time zone.</p>
            <p><span className="text-muted">Your role:</span> <Badge tone="gray" className="capitalize">{s.member?.role}</Badge></p>
            {household && s.can("view_balances") && s.can("manage_settings") && <BalanceCorrection householdId={household.id} openingBalance={household.openingBalance} />}
          </CardContent>
        </Card>
      </div>

      <PasswordCard userId={s.userId} />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" /> Your data</CardTitle><CardDescription>Receipt images are never stored, so they are never part of an export.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void doExport()}><Download /> Export my data (JSON)</Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 /> {dev ? "Delete my account" : "Request account deletion"}</Button>
        </CardContent>
      </Card>

      {dev && (
        <section id="demo" className="scroll-mt-20">
          <Card className="border-warn/50">
            <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-warn-dark" /> Offline mode</CardTitle>
              <CardDescription>This copy isn&apos;t connected to the online database, so everything is stored only in this browser and can&apos;t be shared with your household. Connect Supabase (see README) to use Trust Manager across phones and computers.</CardDescription></CardHeader>
            <CardContent><Button variant="outline" onClick={() => setResetOpen(true)}><RotateCcw /> Erase data on this device</Button></CardContent>
          </Card>
        </section>
      )}

      <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen} title="Erase all data on this device?" description="Every account and record stored in this browser is removed. This can't be undone." confirmLabel="Erase" danger
        onConfirm={async () => { await clearLocalData(); signOut(); qc.clear(); setResetOpen(false); toast.success("Data on this device was erased."); router.replace("/register"); }} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={dev ? "Delete your account?" : "Request account deletion?"} description={dev ? "Your profile and personal records are deleted. If you are the only member, the whole household's data is deleted too. This can't be undone." : "We'll delete your account and personal data. You'll be signed out."} confirmLabel="Delete" danger loading={pending}
        onConfirm={async () => { const r = await run((api) => deleteMyAccount(api)); signOut(); qc.clear(); toast.success(r === "deleted" ? "Account deleted." : "Deletion requested."); router.replace("/login"); }} />
    </div>
  );
}

function ProfileCard({ persona, fullName, userId }: { persona: UserPersona; fullName: string; userId: string }) {
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<Partial<UserPersona> & { fullName?: string }>({ ...persona, fullName });
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function saveProfile() {
    const { fullName: name, id: _id, createdAt: _c, updatedAt: _u, householdId: _h, userId: _uid, ...fields } = draft;
    void _id; void _c; void _u; void _h; void _uid;
    await run(async (api) => {
      await api.update("personas", persona.id, fields as Partial<UserPersona>);
      if (name && name.trim() !== fullName) await api.update("profiles", userId, { fullName: name.trim() });
    }, "Profile saved. Advice will use your updated profile.");
  }

  return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserCog className="size-4" /> Profile & financial persona</CardTitle><CardDescription>The advisor uses this to tailor recommendations.</CardDescription></CardHeader>
        <CardContent>
          {(
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Full name"><Input value={draft.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} /></Field>
                <Field label="Age"><Input type="number" value={draft.age ?? ""} onChange={(e) => set("age", Number(e.target.value))} /></Field>
                <Field label="Occupation"><Input value={draft.occupation ?? ""} onChange={(e) => set("occupation", e.target.value)} /></Field>
                <Field label="Status"><Select value={draft.employmentStatus} onChange={(e) => set("employmentStatus", e.target.value as UserPersona["employmentStatus"])}><option value="student">Student</option><option value="employed">Working professional</option><option value="self-employed">Self-employed</option><option value="unemployed">Unemployed</option></Select></Field>
                <Field label="City"><Input value={draft.city ?? ""} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="Household size"><Input type="number" value={draft.householdSize ?? ""} onChange={(e) => set("householdSize", Number(e.target.value))} /></Field>
                <Field label="Dependents"><Input type="number" value={draft.dependents ?? ""} onChange={(e) => set("dependents", Number(e.target.value))} /></Field>
                <Field label="Monthly income"><Input type="number" value={draft.monthlyIncome ?? ""} onChange={(e) => set("monthlyIncome", Number(e.target.value))} /></Field>
                <Field label="Income frequency"><Select value={draft.incomeFrequency} onChange={(e) => set("incomeFrequency", e.target.value as UserPersona["incomeFrequency"])}>{["monthly", "weekly", "biweekly", "irregular", "quarterly", "yearly"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
                <Field label="Debt repayments / month"><Input type="number" value={draft.debtObligations ?? ""} onChange={(e) => set("debtObligations", Number(e.target.value))} /></Field>
                <Field label="Risk tolerance"><Select value={draft.riskTolerance} onChange={(e) => set("riskTolerance", e.target.value as UserPersona["riskTolerance"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
                <Field label="Preferred language"><Select value={draft.language} onChange={(e) => set("language", e.target.value)}>{["English", "Kinyarwanda", "French", "Swahili"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
              </div>
              <Field label="Financial goals">
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...FINANCIAL_GOAL_OPTIONS, ...(draft.financialGoals ?? [])])].map((g) => {
                    const on = draft.financialGoals?.includes(g);
                    return <button key={g} type="button" onClick={() => set("financialGoals", on ? draft.financialGoals!.filter((x) => x !== g) : [...(draft.financialGoals ?? []), g])} className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-brand bg-brand-light text-brand-dark" : "border-line")}>{g}</button>;
                  })}
                </div>
              </Field>
              <div className="flex justify-end"><Button onClick={() => void saveProfile()} loading={pending}>Save profile</Button></div>
            </div>
          )}
        </CardContent>
      </Card>
  );
}

function PasswordCard({ userId }: { userId: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const check = registerSchema.shape.password.safeParse(password);
  const error = password && !check.success ? check.error.issues[0]?.message : confirm && confirm !== password ? "Passwords don't match" : undefined;
  return (
    <Card>
      <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!check.success || confirm !== password) return;
            setBusy(true);
            try {
              await changePassword(password, userId);
              setPassword("");
              setConfirm("");
              toast.success("Password changed.");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="New password" hint="At least 8 characters with a letter and a number."><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Repeat new password" error={error}><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" variant="outline" className="sm:mt-[22px]" loading={busy} disabled={!check.success || confirm !== password}>Change password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Lets the owner line the recorded balance up with the money they really have. */
function BalanceCorrection({ householdId, openingBalance }: { householdId: string; openingBalance: number }) {
  const { snapshot } = useFinance();
  const { run, pending } = useAction();
  const [value, setValue] = useState("");
  const actual = Math.round(Number(value));
  const valid = value !== "" && Number.isFinite(actual) && actual >= 0;
  const diff = valid ? actual - snapshot.balance : 0;
  return (
    <div className="mt-4 rounded-xl border border-line p-3">
      <p className="text-sm font-medium text-navy">Correct my balance</p>
      <p className="text-xs text-muted">Trust Manager shows {snapshot.fmt(snapshot.balance)} available. If your cash, MoMo and bank together hold a different amount, enter the real total and we&apos;ll adjust your starting balance. Your transactions stay as they are.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label={`Money I really have now (${snapshot.currency})`}><Input type="number" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} className="w-48" /></Field>
        <Button
          variant="outline"
          disabled={!valid || diff === 0}
          loading={pending}
          onClick={() => void run((api) => api.update("households", householdId, { openingBalance: openingBalance + diff }, "Balance corrected by user"), "Balance corrected.").then(() => setValue(""))}
        >
          Update balance
        </Button>
        {valid && diff !== 0 && <p className="pb-2 text-xs text-muted">Adjustment: {snapshot.fmt(diff, { sign: true })}</p>}
      </div>
    </div>
  );
}
