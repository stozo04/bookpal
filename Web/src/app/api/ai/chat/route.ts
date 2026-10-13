import { NextResponse } from "next/server";
import { z } from "zod";
import { aiFail, aiGuard } from "@/lib/ai/guard";
import { accessTokenFor, getConnection, RESPONSES_URL } from "@/lib/ai/openai";

const body = z.object({
  bookTitle: z.string().max(500),
  scope: z.enum(["selection", "section", "page"]),
  sectionTitle: z.string().max(500).optional(),
  excerpt: z.string().max(40_000),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8_000) })).min(1).max(24),
});

const INSTRUCTIONS = `You are a calm, knowledgeable reading companion inside a book reader.
Answer using the excerpt the reader has open, and say so plainly when the excerpt does not contain the answer.
Do not reveal or guess at plot beyond what the excerpt shows. Be concise and warm; use short paragraphs, and quote briefly only when it helps.`;

// Friendly wording for the structured errors OpenAI documents for plan usage.
const friendly = (code?: string) =>
  code === "subscription_sharing_usage_limit_exceeded" ? "You've reached your ChatGPT plan limit for BookPal. It resets on your plan's schedule."
  : code === "subscription_sharing_usage_unavailable" ? "Your ChatGPT plan isn't available for BookPal right now."
  : "The answer couldn't be completed. Please try again.";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function POST(request: Request) {
  const owner = await aiGuard(request, true);
  if (owner instanceof NextResponse) return owner;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiFail(400, "invalid_request", "That question couldn't be read");
  const input = parsed.data;

  const connection = await getConnection(owner.userId);
  if (!connection?.selection) return aiFail(409, "no_model", "Choose a model in AI settings first.");
  let token = await accessTokenFor(owner.userId);
  if (!token) return aiFail(401, "not_connected", "Connect your ChatGPT account in AI settings.");

  const where = input.scope === "selection" ? "a passage the reader selected" : input.scope === "page" ? "the page the reader is on" : "the section the reader is on";
  const context = `Book: ${input.bookTitle}${input.sectionTitle ? `\nSection: ${input.sectionTitle}` : ""}\nThe excerpt below is ${where}.\n\n<excerpt>\n${input.excerpt}\n</excerpt>`;
  // The current excerpt travels with the latest question, so changing scope mid-conversation works.
  const last = input.messages.length - 1;
  const history = input.messages.map((m, i) => (i === last ? { role: m.role, content: `${context}\n\nQuestion: ${m.content}` } : m));

  const call = (accessToken: string) => fetch(RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: connection.selection!.model, instructions: INSTRUCTIONS, input: history,
      reasoning: { effort: connection.selection!.reasoning }, store: false, stream: true,
    }),
    signal: request.signal,
  });

  let upstream = await call(token);
  if (upstream.status === 401) {
    token = await accessTokenFor(owner.userId, true);
    if (token) upstream = await call(token);
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.json().catch(() => null);
    return aiFail(upstream.status === 429 ? 429 : 502, detail?.error?.code ?? "upstream_error", friendly(detail?.error?.code));
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
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
            if (event.type === "response.output_text.delta" && event.delta) controller.enqueue(encoder.encode(sse("delta", { text: event.delta })));
            else if (event.type === "response.completed") completed = true;
            else if (event.type === "response.failed" || event.type === "response.incomplete") {
              controller.enqueue(encoder.encode(sse("error", { message: friendly(event.response?.error?.code) })));
              controller.close();
              return;
            }
          }
        }
        controller.enqueue(encoder.encode(completed ? sse("done", {}) : sse("error", { message: friendly() })));
      } catch {
        controller.enqueue(encoder.encode(sse("error", { message: friendly() })));
      }
      controller.close();
    },
    cancel: () => void reader.cancel(),
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
