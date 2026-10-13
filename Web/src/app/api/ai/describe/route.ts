import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";

const schema = z.object({ title: z.string().min(1).max(500), author: z.string().max(300).optional(), opening: z.string().max(6000).optional() });

const INSTRUCTIONS = `You write a neutral two to three sentence blurb for a book, in plain text with no spoilers and no marketing hype.
If you do not recognise the book and have no opening text to go on, say so in one short sentence instead of guessing.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const description = await text(owner.userId, {
      instructions: INSTRUCTIONS, effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Title: ${input.title}${input.author ? `\nAuthor: ${input.author}` : ""}${input.opening ? `\n\nOpening of the book:\n${input.opening}` : ""}` }],
    });
    return NextResponse.json({ description: description.slice(0, 1200) });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "A description couldn't be drafted. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
