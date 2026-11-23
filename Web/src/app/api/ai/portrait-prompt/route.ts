import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";
import { cleanPortraitPrompt } from "@/lib/portrait";

const schema = z.object({
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).max(6).default([]),
  role: z.string().max(80).default(""),
  looks: z.string().max(4_000).default(""), // sentences describing how they look
  passages: z.string().max(60_000).default(""), // every place they appear so far
  notes: z.string().max(3_000).default(""), // the reader's saved profile, from no further on
}).refine((i) => i.passages.length >= 20 || i.notes.length >= 20);

// The book's title is left out on purpose: an image model that recognises it would
// borrow from film casting or later chapters instead of the text the reader has seen.
const INSTRUCTIONS = (name: string) => `You write a prompt the reader will paste into an image generator to paint a portrait of ${name}, a character in a novel.
Use ONLY the appearance lines, notes and passages you are given. Never add details from later in the story, from adaptations, or from outside what you are given, and never name the book, its author, or any real actor.
1. Every concrete detail the text states about ${name}'s looks MUST appear, specifically: clothing (with team, colour, era, brand), hair, face, build, age, accessories. The appearance lines are the most important input; do not drop or soften any of them.
2. Where the text is silent, fill in plain, believable defaults inferred from context (for example "a man in his late thirties", an ordinary build, hair and dress that suit their life, work, wealth and era). State them simply; never leave a feature "undefined" or hidden in shadow.
3. Give a setting, light and mood that fit what the text shows about them.
4. Describe only ${name} as a person to be painted: no relationships, no other characters, no plot or story events.
Write ONE paragraph of 80 to 160 words describing a head-and-shoulders portrait, painterly and naturalistic. End with: "No text, no lettering, no borders."
Reply with ONLY that paragraph.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const raw = await text(owner.userId, {
      instructions: INSTRUCTIONS(input.name), effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Role: ${input.role || "unknown"}\nAlso called: ${input.aliases.join(", ") || "—"}\n\nAppearance lines:\n${input.looks || "—"}\n\nNotes so far:\n${input.notes || "—"}\n\nPassages:\n${input.passages || "—"}` }],
    });
    const prompt = cleanPortraitPrompt(raw);
    if (!prompt) throw new AiError(502, "empty", "The portrait prompt couldn't be written. Please try again.");
    return NextResponse.json({ prompt });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "The portrait prompt couldn't be written. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
