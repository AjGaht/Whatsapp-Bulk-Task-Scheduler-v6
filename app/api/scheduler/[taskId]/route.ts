import { NextRequest, NextResponse } from "next/server";
import { getTask, deleteTask, pauseTask, resumeTask, updateTask } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const { action } = await req.json() as { action: "pause" | "resume" | "cancel" };

  let result = null;
  if (action === "pause")  result = pauseTask(taskId);
  if (action === "resume") result = resumeTask(taskId);
  if (action === "cancel") result = updateTask(taskId, { status: "cancelled" });

  if (!result) return NextResponse.json({ error: "Task not found or invalid action" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const ok = deleteTask(taskId);
  if (!ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
