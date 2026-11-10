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
import { useSession } from "@/hooks/use-session";
import { resetDemoData } from "@/lib/data/runtime";
import { cn } from "@/lib/utils";
import { deleteMyAccount, exportMyData } from "@/services/account.service";
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
          <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>In-app notifications are always on.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Switch checked={!!prefs?.emailNotifications} disabled={!prefs} onChange={(v) => void run((api) => api.update("preferences", prefs!.id, { emailNotifications: v }), "Saved.")} label="Email reminders" description={dev ? "Simulated in development mode — no email is actually sent." : "Sent through the configured email provider."} />
            <Switch checked={!!prefs?.pushNotifications} disabled={!prefs} onChange={(v) => void run((api) => api.update("preferences", prefs!.id, { pushNotifications: v }), "Saved.")} label="Push notifications" description={dev ? "Simulated in development mode — no push is actually sent." : "Requires installing the app on your phone."} />
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
          </CardContent>
        </Card>
      </div>

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
            <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="size-4 text-warn-dark" /> Development mode</CardTitle>
              <CardDescription>Data lives only in this browser (localStorage). OCR, market prices, the advisor, email/push and savings transfers use clearly labeled mock services. Set NEXT_PUBLIC_DATA_MODE=supabase with your Supabase keys to use the real database.</CardDescription></CardHeader>
            <CardContent><Button variant="outline" onClick={() => setResetOpen(true)}><RotateCcw /> Reset demo data</Button></CardContent>
          </Card>
        </section>
      )}

      <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen} title="Reset all demo data?" description="Every record in this browser is replaced with the original sample household. Any accounts you registered locally will be removed." confirmLabel="Reset demo data" danger
        onConfirm={async () => { await resetDemoData(); signOut(); qc.clear(); setResetOpen(false); toast.success("Demo data reset. Sign in again with a demo account."); router.replace("/login"); }} />
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
