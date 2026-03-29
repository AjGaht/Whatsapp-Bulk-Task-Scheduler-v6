"use client";

import { useRef, useState } from "react";
import { Send, Square, CheckCircle, XCircle, AlertCircle, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AccountId } from "@/lib/whatsapp";
import type { Contact } from "@/lib/excel-parser";
import type { Template } from "@/lib/templates";

interface MessageSenderProps {
  accountId: AccountId;
  contacts: Contact[];
  template: Template;
  isWhatsAppConnected: boolean;
}

interface LogEntry { ts: string; phone: string; success: boolean; error?: string; }
type Status = "idle" | "sending" | "completed" | "stopped";

const DELAY_OPTIONS = [
  { label: "Fast  (~1 s)",   value: 1000 },
  { label: "Normal (~3 s)", value: 3000 },
  { label: "Slow  (~5 s)",  value: 5000 },
  { label: "Safe  (~8 s)",  value: 8000 },
];

function ts() { return new Date().toLocaleTimeString("en-GB", { hour12: false }); }

export function MessageSender({ accountId, contacts, template, isWhatsAppConnected }: MessageSenderProps) {
  const [status, setStatus]     = useState<Status>("idle");
  const [delayMs, setDelayMs]   = useState(3000);
  const [progress, setProgress] = useState({ current: 0, total: 0, sent: 0, failed: 0 });
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const abortRef  = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const validContacts = contacts.filter((c) => c.isValid);
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const appendLog = (e: LogEntry) => {
    setLogs((p) => [...p, e]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  };

  const startSending = async () => {
    setShowConfirm(false);
    setStatus("sending");
    setLogs([]);
    setProgress({ current: 0, total: validContacts.length, sent: 0, failed: 0 });
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/whatsapp/${accountId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: validContacts.map((c) => c.phone), message: template.content, delayMs }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const { error } = await res.json();
        appendLog({ ts: ts(), phone: "system", success: false, error: error ?? "Server error" });
        setStatus("stopped"); return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "progress") {
              setProgress({ current: d.current, total: d.total, sent: d.sent, failed: d.failed });
              if (d.lastResult) appendLog({ ts: ts(), phone: d.lastResult.phone, success: d.lastResult.success, error: d.lastResult.error });
            } else if (d.type === "complete") {
              setStatus("completed");
              setProgress({ current: d.total, total: d.total, sent: d.sent, failed: d.failed });
              appendLog({ ts: ts(), phone: "system", success: true, error: `Done — ${d.sent} sent, ${d.failed} failed` });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        appendLog({ ts: ts(), phone: "system", success: false, error: "Stopped by user." });
      } else {
        appendLog({ ts: ts(), phone: "system", success: false, error: String(err) });
      }
      setStatus("stopped");
    }
  };

  const reset = () => { setStatus("idle"); setLogs([]); setProgress({ current: 0, total: 0, sent: 0, failed: 0 }); };

  return (
    <div className="space-y-4">
      {/* Info row */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <p className="text-xl font-bold">{validContacts.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Valid contacts</p>
        </Card>
        <Card className="p-3">
          <p className="text-sm font-semibold truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Template</p>
        </Card>
      </div>

      {/* Message preview */}
      <Card className="p-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
        <div className="rounded-xl bg-[#005c4b] p-3 max-w-sm">
          <p className="text-xs text-white whitespace-pre-wrap leading-relaxed">{template.content}</p>
          <p className="text-right text-[9px] text-white/60 mt-1">now ✓✓</p>
        </div>
      </Card>

      {/* Delay picker (idle only) */}
      {status === "idle" && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium">Delay between messages</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {DELAY_OPTIONS.map((o) => (
              <button key={o.value} onClick={() => setDelayMs(o.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-mono transition-all text-left ${
                  delayMs === o.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/50"
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Progress */}
      {status !== "idle" && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {status === "sending" ? `Sending ${progress.current}/${progress.total}…` : status === "completed" ? "Completed" : "Stopped"}
            </span>
            <span className="font-mono font-medium">{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <div className="flex gap-3 text-xs font-mono text-muted-foreground">
            <span className="text-primary">✓ {progress.sent}</span>
            <span className="text-destructive">✗ {progress.failed}</span>
            <span>{progress.total - progress.current} left</span>
          </div>
        </Card>
      )}

      {/* Terminal log */}
      {logs.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-700">
            <div className="flex gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-green-500/80" /></div>
            <span className="text-xs text-zinc-400 font-mono ml-1">send.log</span>
          </div>
          <div className="bg-zinc-950 h-44 overflow-y-auto p-2.5 font-mono text-[11px] space-y-0.5">
            {logs.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 leading-5">
                <span className="text-zinc-500 shrink-0">{e.ts}</span>
                {e.phone === "system" ? (
                  <span className={e.success ? "text-sky-400" : "text-amber-400"}>{e.error}</span>
                ) : e.success ? (
                  <><CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" /><span className="text-emerald-300">{e.phone}</span><span className="text-zinc-500">delivered</span></>
                ) : (
                  <><XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" /><span className="text-red-300">{e.phone}</span><span className="text-zinc-500">{e.error ?? "failed"}</span></>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {/* Action */}
      <div className="flex gap-2">
        {status === "idle" && (
          <Button size="sm" className="flex-1" disabled={!isWhatsAppConnected || validContacts.length === 0} onClick={() => setShowConfirm(true)}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> Send to {validContacts.length}
          </Button>
        )}
        {status === "sending" && (
          <Button size="sm" variant="destructive" className="flex-1" onClick={() => abortRef.current?.abort()}>
            <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
          </Button>
        )}
        {(status === "completed" || status === "stopped") && (
          <Button size="sm" variant="outline" className="flex-1" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> New batch
          </Button>
        )}
      </div>

      {(status === "completed" || status === "stopped") && (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${status === "completed" ? "bg-primary/10" : "bg-amber-500/10"}`}>
          {status === "completed" ? <CheckCircle className="w-5 h-5 text-primary" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
          <div>
            <p className="font-medium text-xs">{status === "completed" ? "All processed" : "Stopped"}</p>
            <p className="text-xs text-muted-foreground">{progress.sent} delivered · {progress.failed} failed</p>
          </div>
        </div>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk send</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Sending <strong>{validContacts.length}</strong> messages via template <strong>&quot;{template.name}&quot;</strong>.</p>
                <p>Delay: <strong>{DELAY_OPTIONS.find((o) => o.value === delayMs)?.label}</strong></p>
                <p className="text-amber-500">This cannot be undone once started.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startSending}>Start sending</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
