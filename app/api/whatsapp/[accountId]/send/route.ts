import { NextRequest, NextResponse } from "next/server";
import type { AccountId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

export async function POST(req: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { accountId } = await params;
  const account = whatsappManager.get(accountId as AccountId);

  try {
    const { contacts, message, delayMs = 3000 } = await req.json() as {
      contacts: string[]; message: string; delayMs?: number;
    };

    if (!contacts?.length)
      return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
    if (!message)
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    if (!account.isConnected())
      return NextResponse.json({ error: "WhatsApp not connected" }, { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const push = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        let sent = 0, failed = 0;
        for (let i = 0; i < contacts.length; i++) {
          const phone = contacts[i];
          let success = false, error: string | undefined;
          try {
            success = await account.sendMessage(phone, message);
            if (success) sent++; else { failed++; error = "Send returned false"; }
          } catch (e) {
            failed++; error = e instanceof Error ? e.message : "Unknown error";
          }
          push({ type: "progress", current: i + 1, total: contacts.length, sent, failed, lastResult: { phone, success, error } });
          if (i < contacts.length - 1) {
            await sleep(delayMs + Math.floor(Math.random() * delayMs * 0.3));
          }
        }
        push({ type: "complete", total: contacts.length, sent, failed });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
