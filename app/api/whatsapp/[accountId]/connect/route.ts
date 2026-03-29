import { NextRequest, NextResponse } from "next/server";
import type { AccountId, LoginMethod } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

type Params = { params: Promise<{ accountId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { accountId } = await params;
  const { phone, method } = (await req.json()) as { phone?: string; method?: LoginMethod };

  const account = whatsappManager.get(accountId as AccountId);

  if (method === "pairing") {
    if (!phone || phone.replace(/\D/g, "").length < 7)
      return NextResponse.json({ error: "Provide a valid phone number with country code." }, { status: 400 });
  }

  if (account.isConnected())
    return NextResponse.json({ ok: true, state: account.getState() });

  account.initialize({ phone, method: method ?? "qr" }).catch(console.error);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { accountId } = await params;
  const account = whatsappManager.get(accountId as AccountId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* stream closed */ }
      };

      send(account.getState());
      const unsub = account.subscribe(() => send(account.getState()));

      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); }
        catch { clearInterval(hb); unsub(); }
      }, 25_000);

      return () => { clearInterval(hb); unsub(); };
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
}
