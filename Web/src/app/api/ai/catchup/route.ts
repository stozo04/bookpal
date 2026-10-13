import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";
import { parseRecap } from "@/lib/recap";

const schema = z.object({
  bookTitle: z.string().max(500),
  label: z.string().max(200).optional(), // where the reader stopped, e.g. "Chapter 4"
  recent: z.string().min(40).max(40_000), // the stretch just before their place
  summary: z.string().max(6000).optional(), // the story so far, when one is saved
});

const instructions = (title: string, label?: string) => `You are helping a reader come back to "${title}" after time away${label ? `. They stopped at ${label}` : ""}.
Use only the text given: never add events, reveals or knowledge from beyond it, and never guess what happens next.
Reply with JSON only, no other text:
{"previously": 3 to 6 short lines, oldest first, ending with the most recent events (each under 40 words),
 "people": up to 5 {"name", "now": where they stand or what they want at this point (one short sentence)},
 "questions": exactly 3 {"q": a recall question about the recent events, "a": the answer in one sentence},
 "resume": one sentence on exactly where the reader will pick up}`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const raw = await text(owner.userId, {
      instructions: instructions(input.bookTitle, input.label), effort: "low", signal: request.signal,
      input: [{ role: "user", content: `${input.summary ? `The story so far:\n${input.summary}\n\n` : ""}The most recent pages they read:\n${input.recent}` }],
    });
    const recap = parseRecap(raw);
    if (!recap) throw new AiError(502, "unreadable", "A recap couldn’t be put together. Please try again.");
    return NextResponse.json({ recap });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "A recap couldn’t be put together. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
