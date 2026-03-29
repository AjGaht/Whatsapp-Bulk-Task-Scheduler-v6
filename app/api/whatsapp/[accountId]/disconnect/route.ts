import { NextRequest, NextResponse } from "next/server";
import type { AccountId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { accountId } = await params;
  try {
    await whatsappManager.get(accountId as AccountId).disconnect();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
