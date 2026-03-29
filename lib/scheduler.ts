import * as fs from "fs";
import * as path from "path";
import type { AccountId } from "@/lib/whatsapp";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "active" | "paused" | "completed" | "cancelled";

export interface ScheduledContact {
  phone: string;
  sentAt: string | null;
  failed: boolean;
}

export interface DayLog {
  day: number;
  date: string;
  sent: number;
  failed: number;
  ranAt: string | null;
  sentPhones: string[];
  failedPhones: string[];
}

export interface ScheduledTask {
  id: string;
  name: string;
  accountId: AccountId;
  templateContent: string;
  templateName: string;
  contacts: ScheduledContact[];
  batchSize: number;
  /** Interval between batches in minutes. 30 = every 30 min, 1440 = daily, etc. */
  intervalMinutes: number;
  sendTimeHour: number;   // used only when intervalMinutes >= 1440 (daily+)
  sendTimeMinute: number;
  timezone: string;
  status: TaskStatus;
  createdAt: string;
  nextRunAt: string;
  currentDay: number;
  totalDays: number;
  dayLogs: DayLog[];
  delayMs: number;
  running: boolean;
}

export interface CreateTaskInput {
  name: string;
  accountId: AccountId;
  templateContent: string;
  templateName: string;
  contacts: string[];
  batchSize: number;
  intervalMinutes: number;
  sendTimeHour: number;
  sendTimeMinute: number;
  timezone: string;
  delayMs: number;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const DATA_FILE = path.join(process.cwd(), "scheduled_tasks.json");

// Write mutex — prevents concurrent saves from clobbering each other
let writeLock = false;
const writeQueue: Array<() => void> = [];

function acquireWriteLock(): Promise<void> {
  return new Promise(resolve => {
    if (!writeLock) { writeLock = true; resolve(); }
    else { writeQueue.push(resolve); }
  });
}

function releaseWriteLock(): void {
  const next = writeQueue.shift();
  if (next) { next(); } else { writeLock = false; }
}

function loadTasks(): ScheduledTask[] {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as ScheduledTask[]; }
  catch { return []; }
}

async function saveTasksLocked(tasks: ScheduledTask[]): Promise<void> {
  await acquireWriteLock();
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2)); }
  finally { releaseWriteLock(); }
}

function saveTasks(tasks: ScheduledTask[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Convert a "YYYY-MM-DD HH:MM" wall-clock string in a timezone to a UTC Date. */
function wallClockToUTC(dateStr: string, hour: number, minute: number, tz: string): Date {
  // Guess: treat as UTC and measure drift vs the target timezone
  const guessUTC = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const guessInTz = guessUTC.toLocaleString("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parsed = new Date(guessInTz.replace(/(\d+)\/(\d+)\/(\d+),\s/, "$3-$1-$2T") + "Z");
  const driftMs = guessUTC.getTime() - parsed.getTime();
  return new Date(guessUTC.getTime() + driftMs);
}

/**
 * Compute the next run timestamp.
 * - Sub-daily (intervalMinutes < 1440): next multiple of intervalMinutes from now
 * - Daily+ (intervalMinutes >= 1440): next occurrence of sendTime in timezone,
 *   at least intervalMinutes in the future
 */
function computeNextRun(
  intervalMinutes: number,
  sendTimeHour: number,
  sendTimeMinute: number,
  tz: string,
  fromNow = false,
): string {
  const now = new Date();
  const intervalMs = intervalMinutes * 60_000;

  if (intervalMinutes < 1440) {
    // Sub-daily: just add the interval from now
    return new Date(now.getTime() + intervalMs).toISOString();
  }

  // Daily+: find next occurrence of sendTime that is at least intervalMs in the future
  const minFuture = new Date(now.getTime() + (fromNow ? 0 : intervalMs));

  for (let dayOffset = 0; dayOffset <= Math.ceil(intervalMinutes / 1440) + 1; dayOffset++) {
    const candidate = new Date(minFuture.getTime() + dayOffset * 86_400_000);
    const dateStr = candidate.toLocaleDateString("en-CA", { timeZone: tz });
    const ts = wallClockToUTC(dateStr, sendTimeHour, sendTimeMinute, tz);
    if (ts.getTime() > now.getTime() + (fromNow ? 60_000 : intervalMs - 60_000)) {
      return ts.toISOString();
    }
  }

  // Fallback
  return new Date(now.getTime() + intervalMs).toISOString();
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export function getAllTasks(): ScheduledTask[] { return loadTasks(); }

export function getTask(id: string): ScheduledTask | undefined {
  return loadTasks().find(t => t.id === id);
}

export function createTask(input: CreateTaskInput): ScheduledTask {
  const tasks = loadTasks();
  const totalDays = Math.ceil(input.contacts.length / input.batchSize);
  const interval = Math.max(1, input.intervalMinutes);
  const nextRun = computeNextRun(interval, input.sendTimeHour, input.sendTimeMinute, input.timezone, true);

  const task: ScheduledTask = {
    id: `task-${Date.now()}`,
    name: input.name,
    accountId: input.accountId,
    templateContent: input.templateContent,
    templateName: input.templateName,
    contacts: input.contacts.map(phone => ({ phone, sentAt: null, failed: false })),
    batchSize: input.batchSize,
    intervalMinutes: interval,
    sendTimeHour: input.sendTimeHour,
    sendTimeMinute: input.sendTimeMinute,
    timezone: input.timezone,
    status: "active",
    createdAt: new Date().toISOString(),
    nextRunAt: nextRun,
    currentDay: 1,
    totalDays,
    dayLogs: [],
    delayMs: input.delayMs,
    running: false,
  };

  saveTasks([...tasks, task]);
  console.log(`[Scheduler] Task "${task.name}" created — first run: ${task.nextRunAt}`);
  return task;
}

export function updateTask(id: string, patch: Partial<ScheduledTask>): ScheduledTask | null {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...patch };
  saveTasks(tasks);
  return tasks[idx];
}

export function deleteTask(id: string): boolean {
  const tasks = loadTasks();
  const next = tasks.filter(t => t.id !== id);
  if (next.length === tasks.length) return false;
  saveTasks(next);
  return true;
}

export function pauseTask(id: string): ScheduledTask | null {
  return updateTask(id, { status: "paused", running: false });
}

export function resumeTask(id: string): ScheduledTask | null {
  const task = getTask(id);
  if (!task || task.status !== "paused") return null;
  const nextRun = computeNextRun(task.intervalMinutes, task.sendTimeHour, task.sendTimeMinute, task.timezone, true);
  return updateTask(id, { status: "active", nextRunAt: nextRun, running: false });
}

// ─── Engine ───────────────────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __schedulerStarted?: boolean;
  __schedulerInterval?: ReturnType<typeof setInterval>;
};

export function startSchedulerEngine(): void {
  if (g.__schedulerStarted) return;
  g.__schedulerStarted = true;

  if (g.__schedulerInterval) clearInterval(g.__schedulerInterval);

  // Clear stale running flags from a previous crash — advance nextRunAt if past
  const now = new Date();
  const all = loadTasks();
  const cleaned = all.map(t => {
    if (!t.running) return t;
    const nextRun = new Date(t.nextRunAt) <= now
      ? computeNextRun(t.intervalMinutes, t.sendTimeHour, t.sendTimeMinute, t.timezone)
      : t.nextRunAt;
    console.log(`[Scheduler] Cleared stale running flag for "${t.name}", next: ${nextRun}`);
    return { ...t, running: false, nextRunAt: nextRun };
  });
  if (cleaned.some((t, i) => t.running !== all[i].running || t.nextRunAt !== all[i].nextRunAt)) {
    saveTasks(cleaned);
  }

  console.log("[Scheduler] Engine started");
  checkAndRun();
  g.__schedulerInterval = setInterval(checkAndRun, 30_000);
}

async function checkAndRun(): Promise<void> {
  const now = new Date();
  for (const task of loadTasks()) {
    if (task.status !== "active" || task.running) continue;
    if (new Date(task.nextRunAt) > now) continue;
    runBatch(task).catch(e => console.error(`[Scheduler] Error in "${task.name}":`, e));
  }
}

async function runBatch(task: ScheduledTask): Promise<void> {
  // Immediately lock: set running=true and advance nextRunAt BEFORE any sends
  const nextRun = computeNextRun(task.intervalMinutes, task.sendTimeHour, task.sendTimeMinute, task.timezone);
  updateTask(task.id, { running: true, nextRunAt: nextRun });

  console.log(`[Scheduler] Batch "${task.name}" day ${task.currentDay}/${task.totalDays}`);

  try {
    // Re-read fresh from disk to get latest sentAt state
    const t = getTask(task.id);
    if (!t || t.status !== "active") {
      updateTask(task.id, { running: false });
      return;
    }

    const pending = t.contacts.filter(c => !c.sentAt && !c.failed);
    if (pending.length === 0) {
      updateTask(task.id, { status: "completed", running: false });
      console.log(`[Scheduler] "${t.name}" completed`);
      return;
    }

    const batch = pending.slice(0, t.batchSize);
    const ranAt = new Date().toISOString();
    const date = ranAt.split("T")[0];
    let sent = 0, failed = 0;
    const sentPhones: string[] = [];
    const failedPhones: string[] = [];

    const { whatsappManager } = await import("@/lib/whatsapp");
    const account = whatsappManager.get(t.accountId);

    if (!account.isConnected()) {
      console.warn(`[Scheduler] "${t.name}" skipped — account disconnected. Retry next interval.`);
      updateTask(task.id, { running: false });
      return;
    }

    for (let i = 0; i < batch.length; i++) {
      const contact = batch[i];

      // Allow mid-batch cancellation
      const current = getTask(task.id);
      if (!current || current.status !== "active") {
        console.log(`[Scheduler] "${task.name}" cancelled at contact ${i + 1}`);
        break;
      }

      const idx = t.contacts.findIndex(c => c.phone === contact.phone);
      if (idx === -1) continue;

      const now = new Date().toISOString();
      try {
        const ok = await account.sendMessage(contact.phone, t.templateContent);
        if (ok) {
          t.contacts[idx].sentAt = now;
          sent++; sentPhones.push(contact.phone);
          console.log(`[Scheduler] ✓ ${contact.phone} (${i + 1}/${batch.length})`);
        } else {
          t.contacts[idx].failed = true;
          failed++; failedPhones.push(contact.phone);
          console.warn(`[Scheduler] ✗ ${contact.phone} — false`);
        }
      } catch (e) {
        t.contacts[idx].failed = true;
        failed++; failedPhones.push(contact.phone);
        console.error(`[Scheduler] ✗ ${contact.phone}:`, e);
      }

      // Persist after every send to prevent duplicate sends on crash
      await saveTasksLocked(loadTasks().map(x => x.id === task.id ? { ...x, contacts: t.contacts } : x));

      if (i < batch.length - 1) {
        await new Promise(r => setTimeout(r, t.delayMs + Math.floor(Math.random() * t.delayMs * 0.3)));
      }
    }

    const dayLog: DayLog = { day: t.currentDay, date, sent, failed, ranAt, sentPhones, failedPhones };
    const nextDay = t.currentDay + 1;
    const remaining = t.contacts.filter(c => !c.sentAt && !c.failed).length;
    const isComplete = remaining <= 0 || nextDay > t.totalDays;

    updateTask(task.id, {
      contacts: t.contacts,
      currentDay: nextDay,
      status: isComplete ? "completed" : "active",
      running: false,
      dayLogs: [...t.dayLogs, dayLog],
    });

    console.log(`[Scheduler] "${t.name}" done — ${sent} sent, ${failed} failed. ${remaining} remaining.`);
    if (isComplete) console.log(`[Scheduler] "${t.name}" COMPLETED.`);

  } catch (e) {
    console.error(`[Scheduler] Unexpected error in "${task.name}":`, e);
    updateTask(task.id, { running: false });
  }
}
