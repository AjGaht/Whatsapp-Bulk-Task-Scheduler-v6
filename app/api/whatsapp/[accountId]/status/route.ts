import { NextRequest, NextResponse } from "next/server";
import type { AccountId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { accountId } = await params;
  return NextResponse.json(whatsappManager.get(accountId as AccountId).getState());
}
