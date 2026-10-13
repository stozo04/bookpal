import "server-only";
import { accessTokenFor, getConnection, RESPONSES_URL } from "./openai";

// Shared plumbing for features that call the owner's chosen model through their
// ChatGPT plan. The documented requirements apply: store=false, stream=true, system
// instructions via `instructions`, and no unsupported fields.

export class AiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const friendly = (code?: string) =>
  code === "subscription_sharing_usage_limit_exceeded" ? "You've reached your ChatGPT plan limit for BookPal. It resets on your plan's schedule."
  : code === "subscription_sharing_usage_unavailable" ? "Your ChatGPT plan isn't available for BookPal right now."
  : "The answer couldn't be completed. Please try again.";

export type Turn = { role: "user" | "assistant"; content: string };
export type Request = { instructions: string; input: Turn[]; effort?: string; signal?: AbortSignal };

async function open(userId: string, r: Request): Promise<Response> {
  const connection = await getConnection(userId);
  if (!connection) throw new AiError(401, "not_connected", "Connect your ChatGPT account in AI settings.");
  if (!connection.selection) throw new AiError(409, "no_model", "Choose a model in AI settings first.");
  let token = await accessTokenFor(userId);
  if (!token) throw new AiError(401, "not_connected", "Connect your ChatGPT account in AI settings.");

  const call = (accessToken: string) => fetch(RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: connection.selection!.model, instructions: r.instructions, input: r.input,
      reasoning: { effort: r.effort ?? connection.selection!.reasoning }, store: false, stream: true,
    }),
    signal: r.signal,
  });
  let response = await call(token);
  if (response.status === 401) {
    token = await accessTokenFor(userId, true);
    if (token) response = await call(token);
  }
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => null);
    console.error("[ai] model request refused", { status: response.status, code: detail?.error?.code, type: detail?.error?.type });
    throw new AiError(response.status === 429 ? 429 : 502, detail?.error?.code ?? "upstream_error", friendly(detail?.error?.code));
  }
  return response;
}

// Text as it arrives. Throws if the model stream fails or ends without completing.
export async function* stream(userId: string, r: Request): AsyncGenerator<string> {
  const response = await open(userId, r);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = block.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data) as { type?: string; delta?: string; response?: { error?: { code?: string } } };
        if (event.type === "response.output_text.delta" && event.delta) yield event.delta;
        else if (event.type === "response.completed") completed = true;
        else if (event.type === "response.failed" || event.type === "response.incomplete") {
          console.error("[ai] model stream failed", { type: event.type, code: event.response?.error?.code });
          throw new AiError(502, event.response?.error?.code ?? "failed", friendly(event.response?.error?.code));
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  if (!completed) {
    console.error("[ai] model stream ended without completing");
    throw new AiError(502, "interrupted", friendly());
  }
}

export async function text(userId: string, r: Request): Promise<string> {
  let out = "";
  for await (const piece of stream(userId, r)) out += piece;
  return out.trim();
}

// Split on whitespace so a chunk never cuts a word in half.
export function chunk(source: string, size: number): string[] {
  const out: string[] = [];
  for (let start = 0; start < source.length; ) {
    let end = Math.min(start + size, source.length);
    if (end < source.length) {
      const space = source.lastIndexOf(" ", end);
      if (space > start + size / 2) end = space;
    }
    out.push(source.slice(start, end).trim());
    start = end;
  }
  return out.filter(Boolean);
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  }));
  return out;
}

// Server-sent events with a send() the work function can call as it goes.
export function sseResponse(work: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const body = new ReadableStream({
    async start(out) {
      const send = (event: string, data: unknown) => {
        try { out.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
      };
      try {
        await work(send, controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) send("error", { message: e instanceof AiError ? e.message : friendly() });
      }
      try { out.close(); } catch {}
    },
    cancel: () => controller.abort(),
  });
  return new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
