import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import * as fs from "fs";
import * as path from "path";
import QRCode from "qrcode";
import { isoCountryFromDigits } from "@/lib/phone-region";

export type AccountId = "account-1" | "account-2";
export const ACCOUNT_IDS: AccountId[] = ["account-1", "account-2"];
export type LoginMethod = "qr" | "pairing";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "pairing"
  | "connected";

export interface WhatsAppState {
  status: ConnectionStatus;
  loginMethod: LoginMethod | null;
  qrCode: string | null;
  pairingCode: string | null;
  phone: string | null;
  error: string | null;
}

type Subscriber = () => void;

class WhatsAppAccount {
  private socket: WASocket | null = null;
  private state: WhatsAppState = {
    status: "disconnected", loginMethod: null,
    qrCode: null, pairingCode: null, phone: null, error: null,
  };
  private subscribers: Set<Subscriber> = new Set();
  private authDir: string;
  private isInitializing = false;
  private pendingPhone: string | null = null;
  private pendingMethod: LoginMethod = "qr";
  private pairingCodeRequested = false;

  constructor(private readonly id: AccountId) {
    this.authDir = path.join(process.cwd(), `auth_info_${id}`);
  }

  getId() { return this.id; }
  getState(): WhatsAppState { return { ...this.state }; }
  isConnected() { return this.state.status === "connected"; }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  async initialize(opts?: { phone?: string; method?: LoginMethod }): Promise<void> {
    if (this.isInitializing || this.state.status === "connected") return;
    this.isInitializing = true;
    if (opts?.phone)  this.pendingPhone  = opts.phone;
    if (opts?.method) this.pendingMethod = opts.method;
    try { await this.connect(); }
    finally { this.isInitializing = false; }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try { await this.socket.logout(); } catch { /* ignore */ }
      this.socket = null;
    }
    if (fs.existsSync(this.authDir))
      fs.rmSync(this.authDir, { recursive: true, force: true });
    this.pendingPhone = null;
    this.pairingCodeRequested = false;
    this.setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null });
  }

  async sendMessage(phone: string, message: string): Promise<boolean> {
    if (!this.socket || !this.isConnected()) throw new Error("Not connected");
    const jid = phone.replace(/[^\d]/g, "") + "@s.whatsapp.net";
    try { await this.socket.sendMessage(jid, { text: message }); return true; }
    catch (err) { console.error(`[${this.id}] send failed → ${phone}:`, err); return false; }
  }

  private setState(p: Partial<WhatsAppState>) {
    this.state = { ...this.state, ...p };
    this.subscribers.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
  }

  private async connect(): Promise<void> {
    if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: "silent" });
    this.pairingCodeRequested = false;
    this.setState({ status: "connecting", loginMethod: this.pendingMethod, qrCode: null, pairingCode: null, error: null });

    // BUG FIX 3: Browsers.ubuntu is rejected by WhatsApp → "Couldn't link device"
    // macOS Chrome matches the official WhatsApp Web fingerprint and is accepted.
    // Only pass countryCode for pairing flow — it is unused and harmful for QR.
    const socketConfig: Parameters<typeof makeWASocket>[0] = {
      version,
      logger,
      auth: authState,
      printQRInTerminal: false,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 15_000,
      markOnlineOnConnect: false,
    };

    if (this.pendingMethod === "pairing" && this.pendingPhone) {
      const countryCode = isoCountryFromDigits(this.pendingPhone.replace(/\D/g, ""));
      (socketConfig as Record<string, unknown>).countryCode = countryCode;
    }

    this.socket = makeWASocket(socketConfig);

    this.socket.ev.on("creds.update", saveCreds);
    this.socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR method: convert to PNG data URL and broadcast ──────────────────
      if (qr && this.pendingMethod === "qr") {
        try {
          const dataURL = await QRCode.toDataURL(qr, { width: 300, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
          this.setState({ status: "qr_ready", qrCode: dataURL, error: null });
        } catch {
          this.setState({ status: "qr_ready", qrCode: qr, error: null });
        }
        return;
      }

      // ── Pairing method: request 8-digit code on first QR tick ────────────
      if (qr && this.pendingMethod === "pairing" && !this.socket!.authState.creds.registered && this.pendingPhone && !this.pairingCodeRequested) {
        this.pairingCodeRequested = true;
        try {
          const raw = await this.socket!.requestPairingCode(this.pendingPhone.replace(/\D/g, ""));
          const formatted = (raw ?? "").match(/.{1,4}/g)?.join("-") ?? raw ?? "";
          if (!formatted) throw new Error("Empty pairing code returned.");
          this.setState({ status: "pairing", pairingCode: formatted, error: null });
        } catch (e) {
          this.pairingCodeRequested = false;
          this.setState({ status: "disconnected", pairingCode: null, error: e instanceof Error ? e.message : "Failed to get pairing code" });
        }
        return;
      }

      // ── Connection closed ─────────────────────────────────────────────────
      if (connection === "close") {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          if (fs.existsSync(this.authDir)) fs.rmSync(this.authDir, { recursive: true, force: true });
          this.setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: "Logged out. Please reconnect." });
          return;
        }

        // The socket closed. Reconnect regardless of current status.
        // For qr_ready/pairing we do a SILENT reconnect — keep the current
        // status so the client UI doesn't flash back to the login screen.
        // A fresh QR will be generated and pushed to the client automatically.
        // For pairing, reset pairingCodeRequested so a new code is requested.
        const currentStatus = this.state.status;
        const silentReconnect = currentStatus === "qr_ready" || currentStatus === "pairing";

        console.log(`[${this.id}] Connection closed (code ${code}) during ${currentStatus} — reconnecting${silentReconnect ? " silently" : ""}...`);

        if (silentReconnect) {
          // Keep current status visible to client (don't set "connecting")
          // but clear stale codes so fresh ones are generated on reconnect
          this.pairingCodeRequested = false;
          this.setState({ qrCode: null, pairingCode: null });
        } else {
          this.setState({ status: "connecting", qrCode: null, pairingCode: null });
        }

        // Small delay then reconnect — reuse same pendingMethod/pendingPhone
        setTimeout(() => {
          this.isInitializing = false;
          this.initialize();
        }, 1500);
      }

      // ── Connected ─────────────────────────────────────────────────────────
      // BUG FIX 1: Do NOT check creds.registered here.
      // For QR login Baileys sets creds.account, NOT creds.registered.
      // creds.registered is only true after a pairing-code flow.
      // connection === "open" is the single correct signal for both methods.
      if (connection === "open") {
        const user = this.socket!.user;
        this.setState({
          status: "connected",
          qrCode: null,
          pairingCode: null,
          phone: user?.id?.split(":")[0] ?? null,
          error: null,
        });
        console.log(`[${this.id}] Connected as ${user?.name ?? user?.id}`);
      }
    });
  }
}

class WhatsAppManager {
  private accounts = new Map<AccountId, WhatsAppAccount>(
    ACCOUNT_IDS.map((id) => [id, new WhatsAppAccount(id)])
  );
  get(id: AccountId): WhatsAppAccount {
    const a = this.accounts.get(id);
    if (!a) throw new Error(`Unknown account: ${id}`);
    return a;
  }
}

const g = globalThis as typeof globalThis & { __wam?: WhatsAppManager };
if (!g.__wam) g.__wam = new WhatsAppManager();
export const whatsappManager = g.__wam;
