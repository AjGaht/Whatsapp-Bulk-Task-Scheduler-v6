"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock, Plus, Pause, Play, Trash2, ChevronDown, ChevronUp,
  Clock, Users, CheckCircle, XCircle, AlertCircle, Calendar, RefreshCw, X, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ScheduledTask, TaskStatus } from "@/lib/scheduler";
import type { Contact } from "@/lib/excel-parser";
import type { Template } from "@/lib/templates";
import type { AccountId, WhatsAppState } from "@/lib/whatsapp";
import { ExcelUploader } from "@/components/excel-uploader";
import { TemplateManager } from "@/components/template-manager";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Asia/Bahrain", "Asia/Qatar",
  "Asia/Muscat", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC",
];

const DELAY_OPTIONS = [
  { label: "Fast (~1s)",   value: 1000 },
  { label: "Normal (~3s)", value: 3000 },
  { label: "Slow (~5s)",   value: 5000 },
  { label: "Safe (~8s)",   value: 8000 },
];

// intervalMinutes: < 1440 = sub-daily, >= 1440 = daily+
const INTERVAL_OPTIONS = [
  { label: "Every 30 min", value: 30,   subDaily: true  },
  { label: "Every 1 h",    value: 60,   subDaily: true  },
  { label: "Every 2 h",    value: 120,  subDaily: true  },
  { label: "Every day",    value: 1440, subDaily: false },
  { label: "Every 2 days", value: 2880, subDaily: false },
  { label: "Every 3 days", value: 4320, subDaily: false },
  { label: "Every 5 days", value: 7200, subDaily: false },
  { label: "Every 7 days", value: 10080,subDaily: false },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "Active",    color: "text-primary",          bg: "bg-primary/10 border-primary/20" },
  paused:    { label: "Paused",    color: "text-amber-500",        bg: "bg-amber-500/10 border-amber-500/20" },
  completed: { label: "Completed", color: "text-emerald-500",      bg: "bg-emerald-500/10 border-emerald-500/20" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

function intervalLabel(minutes: number): string {
  const opt = INTERVAL_OPTIONS.find(o => o.value === minutes);
  if (opt) return opt.label;
  if (minutes < 60) return `Every ${minutes} min`;
  if (minutes < 1440) return `Every ${Math.round(minutes / 60)}h`;
  return `Every ${Math.round(minutes / 1440)}d`;
}

// ── Shared hook: single account status ───────────────────────────────────────
function useAccountStatus(accountId: AccountId): WhatsAppState {
  const [status, setStatus] = useState<WhatsAppState>({
    status: "disconnected", loginMethod: null, qrCode: null,
    pairingCode: null, phone: null, error: null,
  });
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/whatsapp/${accountId}/status`);
        const s: WhatsAppState = await r.json();
        if (alive) setStatus(s);
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [accountId]);
  return status;
}

// ── Quick reconnect button ────────────────────────────────────────────────────
function ReconnectButton({ accountId }: { accountId: AccountId }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const connect = async () => {
    setState("loading");
    try {
      await fetch(`/api/whatsapp/${accountId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "qr" }),
      });
      setState("done");
    } catch { setState("idle"); }
  };
  if (state === "done") {
    return (
      <span className="text-amber-400 text-xs cursor-pointer underline" onClick={() => setState("idle")}>
        ⚠ Session started — complete login in Bulk Send tab
      </span>
    );
  }
  return (
    <button onClick={connect} disabled={state === "loading"}
      className="text-amber-400 text-xs underline flex items-center gap-1 hover:text-amber-300 transition-colors">
      {state === "loading"
        ? <><RefreshCw className="w-3 h-3 animate-spin" />Connecting…</>
        : <><Wifi className="w-3 h-3" />⚠ Account not connected — tap to reconnect</>}
    </button>
  );
}

// ── Create task form (scoped to one account) ─────────────────────────────────
interface CreateFormProps {
  accountId: AccountId;
  onCreated: () => void;
  onCancel: () => void;
}

function CreateTaskForm({ accountId, onCreated, onCancel }: CreateFormProps) {
  const [step, setStep] = useState<"contacts" | "template" | "settings">("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [batchSize, setBatchSize] = useState(20);
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [sendHour, setSendHour] = useState(9);
  const [sendMinute, setSendMinute] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [delayMs, setDelayMs] = useState(3000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const accountStatus = useAccountStatus(accountId);
  const isConnected = accountStatus.status === "connected";
  const validContacts = contacts.filter(c => c.isValid);
  const totalBatches = batchSize > 0 ? Math.ceil(validContacts.length / batchSize) : 0;
  const isSubDaily = intervalMinutes < 1440;
  const estDays = Math.ceil((totalBatches * intervalMinutes) / 1440);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Please enter a task name"); return; }
    if (!template)    { setError("Please select a template"); return; }
    if (validContacts.length === 0) { setError("No valid contacts loaded"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), accountId,
          templateContent: template.content, templateName: template.name,
          contacts: validContacts.map(c => c.phone),
          batchSize, intervalMinutes,
          sendTimeHour: sendHour, sendTimeMinute: sendMinute,
          timezone, delayMs,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed"); }
      else { onCreated(); }
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-4 border-primary/30 mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-xs">New Task</span>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step tabs */}
      <div className="flex rounded-lg bg-secondary/50 p-0.5 gap-0.5 mb-3">
        {(["contacts", "template", "settings"] as const).map((s, i) => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all ${
              step === s ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {step === "contacts" && (
        <div className="space-y-2">
          <ExcelUploader onContactsLoaded={setContacts} contacts={contacts} />
          {validContacts.length > 0 && (
            <Button className="w-full" size="sm" onClick={() => setStep("template")}>
              Continue with {validContacts.length} contacts →
            </Button>
          )}
        </div>
      )}

      {step === "template" && (
        <div className="space-y-2">
          <TemplateManager selectedTemplate={template} onSelectTemplate={setTemplate} />
          {template && (
            <Button className="w-full" size="sm" onClick={() => setStep("settings")}>
              Continue with "{template.name}" →
            </Button>
          )}
        </div>
      )}

      {step === "settings" && (
        <div className="space-y-3">
          {/* Account status banner */}
          {!isConnected && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 space-y-1.5">
              <p>⚠ Account not connected. The task will be created but batches will be skipped until connected.</p>
              <button onClick={async () => {
                await fetch(`/api/whatsapp/${accountId}/connect`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ method: "qr" }),
                });
              }} className="underline font-medium hover:text-amber-300">
                Start WhatsApp session →
              </button>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Task name</label>
            <Input placeholder="e.g. Dubai Property Campaign" value={name}
              onChange={e => setName(e.target.value)} className="text-xs" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Contacts per batch</label>
            <Input type="number" min={1} max={validContacts.length} value={batchSize}
              onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))} className="text-xs" />
            <p className="text-[10px] text-muted-foreground">
              {validContacts.length} contacts → {totalBatches} batches
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Send frequency</label>
            <div className="grid grid-cols-2 gap-1">
              {INTERVAL_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setIntervalMinutes(o.value)}
                  className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all text-center ${
                    intervalMinutes === o.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Send time — only relevant for daily+ intervals */}
          {!isSubDaily && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Send time</label>
              <div className="flex gap-2 items-center">
                <Input type="number" min={0} max={23} value={sendHour}
                  onChange={e => setSendHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-16 font-mono text-xs" />
                <span className="font-bold text-muted-foreground">:</span>
                <Input type="number" min={0} max={59} value={sendMinute}
                  onChange={e => setSendMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-16 font-mono text-xs" />
                <span className="text-[10px] text-muted-foreground">
                  {String(sendHour).padStart(2, "0")}:{String(sendMinute).padStart(2, "0")}
                </span>
              </div>
              <div className="space-y-0.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary/50 px-2 py-1.5 text-[10px]">
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Delay between messages</label>
            <div className="grid grid-cols-2 gap-1">
              {DELAY_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setDelayMs(o.value)}
                  className={`rounded-md border px-2 py-1.5 text-[10px] font-mono transition-all text-left ${
                    delayMs === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-secondary/40 p-2.5 text-[10px] space-y-0.5 text-muted-foreground">
            <p><strong className="text-foreground">{validContacts.length}</strong> contacts · <strong className="text-foreground">{batchSize}/batch</strong> · <strong className="text-foreground">{totalBatches} batches</strong></p>
            <p>Frequency: <strong className="text-foreground">{intervalLabel(intervalMinutes)}</strong>{!isSubDaily && <> at <strong className="text-foreground">{String(sendHour).padStart(2,"0")}:{String(sendMinute).padStart(2,"0")}</strong> ({timezone})</>}</p>
            <p>Est. completion: <strong className="text-foreground">~{estDays} day{estDays !== 1 ? "s" : ""}</strong></p>
            <p>Template: <strong className="text-foreground">{template?.name}</strong></p>
          </div>

          {error && <p className="text-[10px] text-destructive">{error}</p>}

          <Button className="w-full" size="sm" onClick={handleCreate} disabled={saving}>
            {saving
              ? <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Creating…</>
              : <><CalendarClock className="w-3 h-3 mr-1.5" />Create Task</>}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onRefresh }: { task: ScheduledTask; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [acting, setActing] = useState(false);

  const accountStatus = useAccountStatus(task.accountId);
  const isConnected = accountStatus.status === "connected";
  const cfg = STATUS_CONFIG[task.status];

  // Progress: take max of dayLogs count and contacts sentAt count to handle any save lag
  const logSent   = task.dayLogs.reduce((s, l) => s + l.sent, 0);
  const logFailed = task.dayLogs.reduce((s, l) => s + l.failed, 0);
  const contSent   = task.contacts.filter(c => c.sentAt).length;
  const contFailed = task.contacts.filter(c => c.failed).length;
  const totalSent   = Math.max(logSent, contSent);
  const totalFailed = Math.max(logFailed, contFailed);
  const total = task.contacts.length;
  const pct = total > 0 ? Math.round((totalSent / total) * 100) : 0;

  const nextRun = task.status === "active"
    ? new Date(task.nextRunAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : null;

  const act = async (a: "pause" | "resume" | "cancel") => {
    setActing(true);
    await fetch(`/api/scheduler/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    onRefresh();
    setActing(false);
  };

  return (
    <Card className={`p-3 border ${cfg.bg}`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-xs truncate">{task.name}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            <span className="text-[10px] flex items-center gap-1">
              {isConnected
                ? <><span className="w-1.5 h-1.5 rounded-full bg-primary" /><span className="text-primary font-medium">{task.accountId === "account-1" ? "Acc 1" : "Acc 2"}</span></>
                : <><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" /><span className="text-muted-foreground">{task.accountId === "account-1" ? "Acc 1" : "Acc 2"} · off</span></>}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="w-2.5 h-2.5" />{task.contacts.length}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />{Math.min(task.currentDay, task.totalDays)}/{task.totalDays}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{intervalLabel(task.intervalMinutes ?? 1440)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {task.status === "active" && (
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => act("pause")} disabled={acting}>
              <Pause className="w-3 h-3" />
            </Button>
          )}
          {task.status === "paused" && (
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => act("resume")} disabled={acting}>
              <Play className="w-3 h-3" />
            </Button>
          )}
          {(task.status === "active" || task.status === "paused") && (
            <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => act("cancel")} disabled={acting}>
              <X className="w-3 h-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>
            <span className="text-primary font-medium">{totalSent}</span> sent ·{" "}
            <span className="text-destructive font-medium">{totalFailed}</span> failed ·{" "}
            {total - totalSent - totalFailed} pending
          </span>
          <span className="font-mono">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1" />
      </div>

      {/* Status */}
      {nextRun && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
          <Clock className="w-2.5 h-2.5" />
          <span>Next: <strong className="text-foreground">{nextRun}</strong> · {task.batchSize} contacts</span>
          {!isConnected && <ReconnectButton accountId={task.accountId} />}
        </div>
      )}
      {task.status === "completed" && (
        <p className="text-[10px] text-emerald-500 mt-1.5 flex items-center gap-1">
          <CheckCircle className="w-2.5 h-2.5" /> All contacts sent
        </p>
      )}
      {task.status === "paused" && (
        <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> Paused
        </p>
      )}

      {/* Expanded: console log */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
          {task.dayLogs.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No batches sent yet.</p>
          ) : (
            <div className="rounded-lg overflow-hidden border border-zinc-700">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900 border-b border-zinc-700">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500/80" />
                  <span className="w-2 h-2 rounded-full bg-yellow-500/80" />
                  <span className="w-2 h-2 rounded-full bg-green-500/80" />
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">send.log</span>
              </div>
              <div className="bg-zinc-950 max-h-56 overflow-y-auto p-2.5 font-mono text-[10px] space-y-2">
                {task.dayLogs.map(log => (
                  <div key={`log-${log.day}-${log.date}`}>
                    <div className="text-zinc-500 mb-1">
                      ── Batch {log.day} · {log.date} · {log.ranAt ? new Date(log.ranAt).toLocaleTimeString(undefined, { timeStyle: "short" }) : "?"} ──
                    </div>
                    {/* FIX: use index in key to prevent duplicate-key error when same phone appears in multiple days */}
                    {(log.sentPhones ?? []).map((phone, i) => (
                      <div key={`sent-${log.day}-${i}`} className="flex items-center gap-2 leading-5">
                        <CheckCircle className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-300">{phone}</span>
                        <span className="text-zinc-600">delivered</span>
                      </div>
                    ))}
                    {(log.failedPhones ?? []).map((phone, i) => (
                      <div key={`fail-${log.day}-${i}`} className="flex items-center gap-2 leading-5">
                        <XCircle className="w-2.5 h-2.5 text-red-400 shrink-0" />
                        <span className="text-red-300">{phone}</span>
                        <span className="text-zinc-600">failed</span>
                      </div>
                    ))}
                    {(!log.sentPhones?.length && !log.failedPhones?.length) && (
                      <div className="text-zinc-500">{log.sent} sent · {log.failed} failed</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-[#005c4b] p-2.5">
            <p className="text-[9px] text-white/60 mb-1 uppercase tracking-wider">Template · {task.templateName}</p>
            <p className="text-[10px] text-white whitespace-pre-wrap leading-relaxed line-clamp-3">{task.templateContent}</p>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &quot;<strong>{task.name}</strong>&quot; and all progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={async () => { await fetch(`/api/scheduler/${task.id}`, { method: "DELETE" }); onRefresh(); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Per-account scheduler panel ───────────────────────────────────────────────
interface AccountSchedulerProps {
  accountId: AccountId;
  label: string;
  color: string;
  tasks: ScheduledTask[];
  onRefresh: () => void;
}

function AccountSchedulerPanel({ accountId, label, color, tasks, onRefresh }: AccountSchedulerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const accountStatus = useAccountStatus(accountId);
  const isConnected = accountStatus.status === "connected";

  const active    = tasks.filter(t => t.status === "active");
  const paused    = tasks.filter(t => t.status === "paused");
  const completed = tasks.filter(t => t.status === "completed" || t.status === "cancelled");

  return (
    <div className="flex flex-col gap-3">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 ${color}`} />
          <span className={`font-semibold text-sm ${color}`}>{label}</span>
          {active.length > 0 && (
            <span className="rounded-full bg-primary/15 text-primary text-[9px] font-bold px-1.5 py-0.5">
              {active.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Connection pill */}
          {isConnected
            ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />{accountStatus.phone ? `+${accountStatus.phone}` : "Connected"}
              </span>
            : <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />Disconnected
              </span>}
          {!showCreate && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3 h-3 mr-1" />New Task
            </Button>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTaskForm
          accountId={accountId}
          onCreated={() => { setShowCreate(false); onRefresh(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {tasks.length === 0 && !showCreate && (
        <Card className="p-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <CalendarClock className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs font-medium">No tasks for {label}</p>
            <p className="text-[10px] text-muted-foreground">Schedule batches to send automatically.</p>
            <Button size="sm" className="mt-1" onClick={() => setShowCreate(true)}>
              <Plus className="w-3 h-3 mr-1" />Create Task
            </Button>
          </div>
        </Card>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active</p>
          {active.map(t => <TaskCard key={t.id} task={t} onRefresh={onRefresh} />)}
        </div>
      )}
      {paused.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Paused</p>
          {paused.map(t => <TaskCard key={t.id} task={t} onRefresh={onRefresh} />)}
        </div>
      )}
      {completed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Completed / Cancelled</p>
          {completed.map(t => <TaskCard key={t.id} task={t} onRefresh={onRefresh} />)}
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function TaskScheduler() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/scheduler");
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const acc1Tasks = tasks.filter(t => t.accountId === "account-1");
  const acc2Tasks = tasks.filter(t => t.accountId === "account-2");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AccountSchedulerPanel
        accountId="account-1" label="Account 1" color="text-primary"
        tasks={acc1Tasks} onRefresh={fetchTasks}
      />
      <AccountSchedulerPanel
        accountId="account-2" label="Account 2" color="text-amber-500"
        tasks={acc2Tasks} onRefresh={fetchTasks}
      />
    </div>
  );
}
