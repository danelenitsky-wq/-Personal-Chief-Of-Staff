"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { UserProfile } from "@/types/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { updateProfileAction } from "@/app/actions/profile";
import type { UpdateProfileInput } from "@/lib/validation/schemas";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["Asia/Jerusalem", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "UTC"];

type Integrations = { whatsapp: boolean; googleCalendar: boolean; supabase: boolean };

export function SettingsForm({ profile, integrations }: { profile: UserProfile; integrations: Integrations }) {
  const [p, setP] = useState(profile);
  const [newArea, setNewArea] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setP((x) => ({ ...x, [key]: value }));
  const text = (key: keyof UserProfile) => (e: { target: { value: string } }) => set(key, e.target.value as never);

  const save = () =>
    startTransition(async () => {
      const input: UpdateProfileInput = {
        name: p.name,
        phoneNumber: p.phoneNumber ?? "",
        timezone: p.timezone,
        weekStartsOn: p.weekStartsOn,
        morningBriefTime: p.morningBriefTime,
        eveningReviewEnabled: p.eveningReviewEnabled,
        weeklyReviewDay: p.weeklyReviewDay,
        workingHoursStart: p.workingHoursStart,
        workingHoursEnd: p.workingHoursEnd,
        preferredDeepWorkStart: p.preferredDeepWorkStart || null,
        preferredDeepWorkEnd: p.preferredDeepWorkEnd || null,
        preferredWorkoutStart: p.preferredWorkoutStart || null,
        preferredWorkoutEnd: p.preferredWorkoutEnd || null,
        lifeAreas: p.lifeAreas,
      };
      const r = await updateProfileAction(input);
      setStatus(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
    });

  const tzOptions = TIMEZONES.includes(p.timezone) ? TIMEZONES : [p.timezone, ...TIMEZONES];

  return (
    <div className="space-y-6">
      <Section title="Profile" description="Used for greetings and to recognise you on WhatsApp.">
        <Grid>
          <Field label="Name"><Input value={p.name ?? ""} onChange={text("name")} /></Field>
          <Field label="WhatsApp number"><Input value={p.phoneNumber ?? ""} onChange={text("phoneNumber")} placeholder="+972501234567" /></Field>
          <Field label="Timezone">
            <NativeSelect value={p.timezone} onChange={text("timezone")}>
              {tzOptions.map((tz) => <option key={tz}>{tz}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Week starts on">
            <NativeSelect value={p.weekStartsOn} onChange={(e) => set("weekStartsOn", Number(e.target.value) as 0 | 1)}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </NativeSelect>
          </Field>
        </Grid>
      </Section>

      <Section title="Connections">
        <div className="divide-y rounded-lg border">
          <Connection name="WhatsApp" connected={integrations.whatsapp} phase="Phase 2" detail="Capture, reminders and briefs by message" />
          <Connection name="Google Calendar" connected={integrations.googleCalendar} phase="Phase 5" detail="Availability, timeline and time-blocking" />
          <Connection name="Database" connected={integrations.supabase} phase="Now" detail={integrations.supabase ? "Supabase" : "Demo mode: in-memory mock data"} />
        </div>
      </Section>

      <Section title="Rhythm" description="When your Chief of Staff checks in. Notifications stay minimal by default.">
        <Grid>
          <Field label="Morning brief"><Input type="time" value={p.morningBriefTime ?? ""} onChange={text("morningBriefTime")} /></Field>
          <Field label="Weekly review day">
            <NativeSelect value={p.weeklyReviewDay} onChange={(e) => set("weeklyReviewDay", Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </NativeSelect>
          </Field>
        </Grid>
        <label className="mt-4 flex items-center justify-between rounded-lg border px-4 py-3">
          <span>
            <span className="block text-sm font-medium">Evening review</span>
            <span className="block text-xs text-muted-foreground">A short end-of-day summary on WhatsApp</span>
          </span>
          <Switch checked={p.eveningReviewEnabled} onCheckedChange={(v) => set("eveningReviewEnabled", v)} />
        </label>
      </Section>

      <Section title="Working hours & preferences" description="Used to find free time and to place deep work sensibly.">
        <Grid>
          <Field label="Working hours start"><Input type="time" value={p.workingHoursStart ?? ""} onChange={text("workingHoursStart")} /></Field>
          <Field label="Working hours end"><Input type="time" value={p.workingHoursEnd ?? ""} onChange={text("workingHoursEnd")} /></Field>
          <Field label="Deep work from"><Input type="time" value={p.preferredDeepWorkStart ?? ""} onChange={text("preferredDeepWorkStart")} /></Field>
          <Field label="Deep work until"><Input type="time" value={p.preferredDeepWorkEnd ?? ""} onChange={text("preferredDeepWorkEnd")} /></Field>
          <Field label="Workout from"><Input type="time" value={p.preferredWorkoutStart ?? ""} onChange={text("preferredWorkoutStart")} /></Field>
          <Field label="Workout until"><Input type="time" value={p.preferredWorkoutEnd ?? ""} onChange={text("preferredWorkoutEnd")} /></Field>
        </Grid>
      </Section>

      <Section title="Life areas">
        <div className="flex flex-wrap gap-2">
          {p.lifeAreas.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-1 pr-1.5 pl-3 text-sm">
              {a}
              <button
                aria-label={`Remove ${a}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => set("lifeAreas", p.lifeAreas.filter((x) => x !== a))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-3 flex max-w-sm gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const area = newArea.trim();
            if (area && !p.lifeAreas.includes(area)) set("lifeAreas", [...p.lifeAreas, area]);
            setNewArea("");
          }}
        >
          <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Add an area, e.g. Travel" />
          <Button type="submit" variant="outline">Add</Button>
        </form>
      </Section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        {status && <span className={status.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{status.text}</span>}
        <Button onClick={save} disabled={pending} size="lg" className="shadow-lg">Save settings</Button>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-0.5">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-4 pb-5">{children}</CardContent>
    </Card>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Connection({ name, connected, phase, detail }: { name: string; connected: boolean; phase: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {connected ? <Badge variant="success">Connected</Badge> : <Badge variant="outline">{phase === "Now" ? "Demo" : `Coming in ${phase}`}</Badge>}
    </div>
  );
}
