"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Wifi, WifiOff, RefreshCw, CheckCircle, Smartphone,
  KeyRound, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AccountId, LoginMethod, WhatsAppState } from "@/lib/whatsapp";

type WASummary = Pick<WhatsAppState, "status" | "phone">;

interface WhatsAppAuthProps {
  accountId: AccountId;
  onSummaryChange?: (s: WASummary) => void;
}

export function WhatsAppAuth({ accountId, onSummaryChange }: WhatsAppAuthProps) {
  const [state, setState] = useState<WhatsAppState>({
    status: "disconnected", loginMethod: null,
    qrCode: null, pairingCode: null, phone: null, error: null,
  });
  const [method, setMethod] = useState<LoginMethod>("qr");
  const [phoneInput, setPhoneInput] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [inputError, setInputError] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Keep a ref to onSummaryChange so it is NEVER a useEffect dependency ──
  // If onSummaryChange were listed as a dep, any parent re-render that passes
  // a new function reference (even with same semantics) would re-fire the
  // effect and call setState in the parent → infinite loop.
  const onSummaryChangeRef = useRef(onSummaryChange);
  useEffect(() => { onSummaryChangeRef.current = onSummaryChange; });

  const base = `/api/whatsapp/${accountId}`;

  // Client-side canvas fallback for raw QR strings
  useEffect(() => {
    if (state.status === "qr_ready" && state.qrCode && !state.qrCode.startsWith("data:") && canvasRef.current) {
      import("qrcode").then((lib) =>
        lib.default.toCanvas(canvasRef.current!, state.qrCode!, { width: 280, margin: 2 })
      ).catch(() => {});
    }
  }, [state.qrCode, state.status]);

  const openSSE = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource(`${base}/connect`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const s: WhatsAppState = JSON.parse(ev.data);
        setState(s);
        if (["qr_ready", "pairing", "connected"].includes(s.status)) setIsRequesting(false);
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      // THE KEY FIX: After the user scans the QR code, Baileys fires a transient
      // connection:close on the server (WebSocket upgrade), which briefly breaks
      // the SSE stream and triggers this onerror. If we reset to "disconnected"
      // here we wipe the qr_ready/connecting state and the UI goes back to the
      // login screen — user has to click Refresh to try again.
      //
      // Solution: only reset to disconnected if we are NOT in an in-flight auth
      // state (qr_ready or pairing or connecting). For those states, leave the
      // current status alone — EventSource will auto-reconnect within ~1-2s and
      // the server's buffered state (now "connected") will arrive via onmessage.
      setState((prev) => {
        const inFlight = ["connecting", "qr_ready", "pairing"].includes(prev.status);
        if (prev.status === "connected" || inFlight) return prev; // hold — do not reset
        return { ...prev, status: "disconnected", error: "Connection lost." };
      });
      setIsRequesting(false);
    };
  }, [base]);

  useEffect(() => {
    fetch(`${base}/status`).then((r) => r.json()).then((s: WhatsAppState) => {
      setState(s);
      if (s.loginMethod) setMethod(s.loginMethod);
      if (["connecting", "qr_ready", "pairing", "connected"].includes(s.status)) openSSE();
    }).catch(() => {});
    return () => esRef.current?.close();
  }, [base, openSSE]);

  // Call onSummaryChange via ref — no dependency on the prop function itself,
  // so this effect only re-runs when status or phone actually changes.
  useEffect(() => {
    onSummaryChangeRef.current?.({ status: state.status, phone: state.phone });
  }, [state.status, state.phone]);

  const connect = async () => {
    if (method === "pairing") {
      const digits = phoneInput.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        setInputError("Enter a valid number with country code, e.g. +971501234567");
        return;
      }
      setInputError("");
    }
    setIsRequesting(true);
    openSSE();
    const res = await fetch(`${base}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneInput.trim() || undefined, method }),
    });
    if (!res.ok) {
      const d = await res.json();
      setState((p) => ({ ...p, error: d.error ?? "Failed to start session." }));
      setIsRequesting(false);
    }
  };

  const disconnect = async () => {
    esRef.current?.close();
    await fetch(`${base}/disconnect`, { method: "POST" });
    setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null });
    setPhoneInput(""); setIsRequesting(false);
  };

  const retry = async () => {
    // Disconnect on the server to clear any stale socket, then reset UI
    esRef.current?.close();
    await fetch(`${base}/disconnect`, { method: "POST" }).catch(() => {});
    setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null });
    setIsRequesting(false);
  };

  const isActive = ["connecting", "qr_ready", "pairing"].includes(state.status);

  return (
    <div className="space-y-5">
      <StatusBanner state={state} />

      {state.status === "connected" ? (
        <ConnectedView phone={state.phone} onDisconnect={disconnect} />
      ) : state.status === "qr_ready" ? (
        <QRView
          qrCode={state.qrCode}
          canvasRef={canvasRef}
          onRefresh={retry}
          onDisconnect={disconnect}
        />
      ) : state.status === "pairing" ? (
        <PairingCodeView code={state.pairingCode} onRetry={retry} onDisconnect={disconnect} />
      ) : (
        <>
          {/* Method picker */}
          <div className="grid grid-cols-2 gap-3">
            {(["qr", "pairing"] as LoginMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setInputError(""); }}
                disabled={isActive}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all ${
                  method === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {m === "qr"
                  ? <><QrCode className="w-6 h-6" /><span>QR Code</span><span className="text-xs font-normal opacity-70">Scan with camera</span></>
                  : <><KeyRound className="w-6 h-6" /><span>Phone Number</span><span className="text-xs font-normal opacity-70">Enter 8-digit code</span></>
                }
              </button>
            ))}
          </div>

          {/* Phone input (pairing only) */}
          {method === "pairing" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">WhatsApp phone number</label>
              <Input
                placeholder="+971501234567"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                disabled={isRequesting || isActive}
                className="font-mono"
              />
              {inputError && <p className="text-xs text-destructive">{inputError}</p>}
              <p className="text-xs text-muted-foreground">Include country code · e.g. +971 50 123 4567</p>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={connect}
            disabled={isRequesting || isActive || (method === "pairing" && !phoneInput.trim())}
          >
            {isRequesting || isActive ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Connecting…</>
            ) : method === "qr" ? (
              <><QrCode className="w-4 h-4 mr-2" />Start Session &amp; Show QR</>
            ) : (
              <><KeyRound className="w-4 h-4 mr-2" />Get Pairing Code</>
            )}
          </Button>
        </>
      )}

      <HowItWorks method={method} status={state.status} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBanner({ state }: { state: WhatsAppState }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string; sub: string }> = {
    disconnected: { bg: "bg-secondary/50",   icon: <WifiOff className="w-4 h-4 text-muted-foreground" />,           label: "Not connected",      sub: "Choose a login method and connect below." },
    connecting:   { bg: "bg-amber-500/10",   icon: <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />,   label: "Connecting…",        sub: "Establishing connection to WhatsApp." },
    qr_ready:     { bg: "bg-primary/10",     icon: <QrCode className="w-4 h-4 text-primary" />,                     label: "Scan QR Code",       sub: "Open WhatsApp on your phone and scan the code below." },
    pairing:      { bg: "bg-primary/10",     icon: <KeyRound className="w-4 h-4 text-primary" />,                   label: "Pairing code ready", sub: "Enter the code in WhatsApp on your phone." },
    connected:    { bg: "bg-primary/10",     icon: <CheckCircle className="w-4 h-4 text-primary" />,                label: `Connected${state.phone ? ` · +${state.phone}` : ""}`, sub: "WhatsApp is linked and ready." },
  };
  const cfg = map[state.status] ?? map.disconnected;
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg ${cfg.bg}`}>
      <div className="mt-0.5">{cfg.icon}</div>
      <div>
        <p className="font-medium text-sm">{cfg.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{state.error ?? cfg.sub}</p>
      </div>
    </div>
  );
}

function QRView({ qrCode, canvasRef, onRefresh, onDisconnect }: {
  qrCode: string | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-medium text-muted-foreground">Scan with WhatsApp on your phone</p>
        <div className="p-3 bg-white rounded-xl shadow-md relative">
          {qrCode?.startsWith("data:") ? (
            <Image src={qrCode} alt="WhatsApp QR Code" width={280} height={280} unoptimized className="block" />
          ) : qrCode ? (
            <canvas ref={canvasRef} width={280} height={280} style={{ display: "block" }} />
          ) : (
            // qrCode is null but status is still qr_ready — means QR was just scanned,
            // server cleared qrCode while completing the handshake. Show connecting UI.
            <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
              <p className="text-sm font-medium text-green-700">QR scanned — connecting…</p>
              <p className="text-xs text-gray-500 text-center px-4">Keep this page open. WhatsApp is verifying your device.</p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-xs">QR codes expire after ~60 seconds. Click Refresh to get a new one.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect}><WifiOff className="w-3 h-3 mr-1" /> Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

function PairingCodeView({ code, onRetry, onDisconnect }: { code: string | null; onRetry: () => void; onDisconnect: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="p-3 rounded-full bg-primary/10"><KeyRound className="w-8 h-8 text-primary" /></div>
        <div>
          <p className="font-semibold text-base mb-1">Enter this code in WhatsApp</p>
          <p className="text-sm text-muted-foreground">WhatsApp → ⋮ Menu → <strong>Linked Devices → Link with phone number</strong></p>
        </div>
        <div className="flex items-center justify-center px-6 py-4 rounded-xl bg-secondary border border-border min-w-[200px]">
          {code
            ? <span className="font-mono text-4xl font-bold tracking-[0.25em] text-foreground select-all">{code}</span>
            : <RefreshCw className="w-7 h-7 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground max-w-xs">Valid for ~60 seconds. Click Try again if it expires.</p>
        <div className="flex gap-2 flex-wrap justify-center">
          <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="w-3 h-3 mr-1" /> Try again</Button>
          <Button variant="ghost" size="sm" onClick={onDisconnect}><WifiOff className="w-3 h-3 mr-1" /> Cancel</Button>
        </div>
      </div>
    </Card>
  );
}

function ConnectedView({ phone, onDisconnect }: { phone: string | null; onDisconnect: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-primary/10"><CheckCircle className="w-10 h-10 text-primary" /></div>
        <div>
          <p className="text-lg font-semibold">WhatsApp Connected!</p>
          {phone && <p className="text-sm text-muted-foreground mt-1">Logged in as +{phone}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onDisconnect}><WifiOff className="w-4 h-4 mr-2" /> Disconnect</Button>
      </div>
    </Card>
  );
}

function HowItWorks({ method, status }: { method: LoginMethod; status: string }) {
  if (status === "connected") return null;
  const qrSteps = [
    { n: 1, text: 'Click "Start Session & Show QR"' },
    { n: 2, text: "A QR code appears on screen" },
    { n: 3, text: "Open WhatsApp on your phone" },
    { n: 4, text: "Go to ⋮ → Linked Devices → Link a Device" },
    { n: 5, text: "Point your camera at the QR code" },
  ];
  const pairingSteps = [
    { n: 1, text: 'Enter your number and click "Get Pairing Code"' },
    { n: 2, text: "An 8-character code appears on screen" },
    { n: 3, text: "Open WhatsApp on your phone" },
    { n: 4, text: "Go to ⋮ → Linked Devices → Link with phone number" },
    { n: 5, text: "Type the code shown — you're linked!" },
  ];
  const steps = method === "qr" ? qrSteps : pairingSteps;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">How it works</p>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
            <span className="text-sm text-muted-foreground">{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
