"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Users, CalendarClock, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ExcelUploader } from "@/components/excel-uploader";
import { TemplateManager } from "@/components/template-manager";
import { WhatsAppAuth } from "@/components/whatsapp-auth";
import { MessageSender } from "@/components/message-sender";
import { TaskScheduler } from "@/components/task-scheduler";
import type { Contact } from "@/lib/excel-parser";
import type { Template } from "@/lib/templates";
import type { AccountId, WhatsAppState } from "@/lib/whatsapp";

// ─── Live clock ───────────────────────────────────────────────────────────────
const CLOCK_TZ = "Asia/Dubai"; // change this to your preferred timezone

function LiveClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", {
        timeZone: CLOCK_TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }));
      setDate(now.toLocaleDateString("en-US", {
        timeZone: CLOCK_TZ,
        weekday: "short",
        month: "short",
        day: "numeric",
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
      <div className="text-right">
        <p className="font-mono text-sm font-semibold leading-tight">{time}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{date} · {CLOCK_TZ}</p>
      </div>
    </div>
  );
}

// ─── Per-account state ────────────────────────────────────────────────────────
interface AccountState {
  contacts: Contact[];
  template: Template | null;
  wa: Pick<WhatsAppState, "status" | "phone">;
  tab: "upload" | "template" | "connect" | "send";
}

function initAccount(): AccountState {
  return {
    contacts: [],
    template: null,
    wa: { status: "disconnected", phone: null },
    tab: "upload",
  };
}

const ACCOUNTS: { id: AccountId; label: string; color: string }[] = [
  { id: "account-1", label: "Account 1", color: "text-primary" },
  { id: "account-2", label: "Account 2", color: "text-amber-500" },
];

const TABS = [
  { id: "connect",  label: "1. Connect" },
  { id: "upload",   label: "2. Upload" },
  { id: "template", label: "3. Template" },
  { id: "send",     label: "4. Send" },
] as const;

type TabId = typeof TABS[number]["id"];

function canReach(tab: TabId, s: AccountState): boolean {
  if (tab === "connect")  return true;
  if (tab === "upload")   return true;
  if (tab === "template") return s.contacts.filter((c) => c.isValid).length > 0;
  if (tab === "send")     return s.wa.status === "connected" && s.template !== null;
  return false;
}

// ─── Account Panel ────────────────────────────────────────────────────────────
function AccountPanel({
  id, label, color, state,
  onContactsLoaded, onTemplateSelected, onWaSummaryChange,
}: {
  id: AccountId; label: string; color: string;
  state: AccountState;
  onContactsLoaded: (c: Contact[]) => void;
  onTemplateSelected: (t: Template | null) => void;
  onWaSummaryChange: (s: Pick<WhatsAppState, "status" | "phone">) => void;
}) {
  const [tab, setTab] = useState<TabId>("connect");
  const validContacts = state.contacts.filter((c) => c.isValid);
  const isConnected = state.wa.status === "connected";

  return (
    <div className="flex flex-col gap-4">
      {/* Account header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className={`w-4 h-4 ${color}`} />
          <span className={`font-semibold text-sm ${color}`}>{label}</span>
        </div>
        {/* Connection status pill */}
        {state.wa.status === "connected" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {state.wa.phone ? `+${state.wa.phone}` : "Connected"}
          </span>
        ) : state.wa.status === "connecting" || state.wa.status === "pairing" || state.wa.status === "qr_ready" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Connecting…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
            Disconnected
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg bg-secondary/50 p-0.5 gap-0.5">
        {TABS.map((t) => {
          const reachable = canReach(t.id, state);
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              disabled={!reachable}
              onClick={() => reachable && setTab(t.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-background shadow-sm text-foreground"
                  : reachable
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <Card className="p-4 min-h-[320px]">
        {tab === "upload" && (
          <ExcelUploader onContactsLoaded={onContactsLoaded} contacts={state.contacts} />
        )}
        {tab === "template" && (
          <TemplateManager selectedTemplate={state.template} onSelectTemplate={onTemplateSelected} />
        )}
        {tab === "connect" && (
          <WhatsAppAuth accountId={id} onSummaryChange={onWaSummaryChange} />
        )}
        {tab === "send" && state.template && (
          <MessageSender
            accountId={id}
            contacts={validContacts}
            template={state.template}
            isWhatsAppConnected={isConnected}
          />
        )}
        {tab === "send" && !state.template && (
          <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground">
            Select a template first (tab 2)
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [pageTab, setPageTab] = useState<"bulk" | "scheduler">("bulk");
  const [accs, setAccs] = useState<Record<AccountId, AccountState>>({
    "account-1": initAccount(),
    "account-2": initAccount(),
  });

  // Stable updater — uses functional setState so it never needs `accs` in deps
  const update = useCallback((id: AccountId, patch: Partial<AccountState>) => {
    setAccs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []); // stable forever

  // ── Per-account stable callbacks — memoized per account id ──────────────────
  // IMPORTANT: These MUST be stable references (useCallback with [] deps).
  // Passing inline arrows like (c) => update(id, {...}) directly in JSX creates
  // a new function on every render, which causes infinite loops in child
  // useEffect hooks that list onSummaryChange as a dependency.
  const onContactsLoaded1 = useCallback((c: Contact[]) => update("account-1", { contacts: c }), [update]);
  const onContactsLoaded2 = useCallback((c: Contact[]) => update("account-2", { contacts: c }), [update]);
  const onTemplateSelected1 = useCallback((t: Template | null) => update("account-1", { template: t }), [update]);
  const onTemplateSelected2 = useCallback((t: Template | null) => update("account-2", { template: t }), [update]);
  const onWaSummaryChange1 = useCallback((wa: Pick<WhatsAppState, "status" | "phone">) => update("account-1", { wa }), [update]);
  const onWaSummaryChange2 = useCallback((wa: Pick<WhatsAppState, "status" | "phone">) => update("account-2", { wa }), [update]);

  const stableCallbacks: Record<AccountId, {
    onContactsLoaded: (c: Contact[]) => void;
    onTemplateSelected: (t: Template | null) => void;
    onWaSummaryChange: (s: Pick<WhatsAppState, "status" | "phone">) => void;
  }> = {
    "account-1": { onContactsLoaded: onContactsLoaded1, onTemplateSelected: onTemplateSelected1, onWaSummaryChange: onWaSummaryChange1 },
    "account-2": { onContactsLoaded: onContactsLoaded2, onTemplateSelected: onTemplateSelected2, onWaSummaryChange: onWaSummaryChange2 },
  };

  // Poll both account statuses
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      for (const { id } of ACCOUNTS) {
        try {
          const r = await fetch(`/api/whatsapp/${id}/status`);
          const s: WhatsAppState = await r.json();
          if (!alive) return;
          setAccs((prev) => ({ ...prev, [id]: { ...prev[id], wa: { status: s.status, phone: s.phone } } }));
        } catch { /* ignore */ }
      }
    };
    void pull();
    const t = setInterval(pull, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void pull(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <MessageCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">WBM</h1>
                <p className="text-[11px] text-muted-foreground leading-tight">WhatsApp Bulk Messenger · Dual Account</p>
              </div>
            </div>
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* Page-level tab switcher */}
        <div className="flex rounded-lg bg-secondary/50 p-0.5 gap-0.5 mb-6 max-w-sm">
          <button
            onClick={() => setPageTab("bulk")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all ${
              pageTab === "bulk" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Bulk Send
          </button>
          <button
            onClick={() => setPageTab("scheduler")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all ${
              pageTab === "scheduler" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" /> Scheduler
          </button>
        </div>

        {/* Bulk send view */}
        {pageTab === "bulk" && (
          <>
            <Card className="p-4 mb-6">
              <p className="text-sm text-muted-foreground">
                Each column is an independent WhatsApp account. Upload a separate Excel file, choose a template, connect via QR or phone pairing, then send — all independently per account.
              </p>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {ACCOUNTS.map(({ id, label, color }) => (
                <AccountPanel
                  key={id}
                  id={id}
                  label={label}
                  color={color}
                  state={accs[id]}
                  onContactsLoaded={stableCallbacks[id].onContactsLoaded}
                  onTemplateSelected={stableCallbacks[id].onTemplateSelected}
                  onWaSummaryChange={stableCallbacks[id].onWaSummaryChange}
                />
              ))}
            </div>
          </>
        )}

        {/* Scheduler view */}
        {pageTab === "scheduler" && (
          <div className="pb-6">
            <TaskScheduler />
          </div>
        )}
      </div>
    </main>
  );
}
