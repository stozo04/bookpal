import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";
import { cleanPortraitPrompt } from "@/lib/portrait";

const schema = z.object({
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).max(6).default([]),
  role: z.string().max(80).default(""),
  passages: z.string().min(20).max(60_000), // every place they appear so far
});

// The book's title is left out on purpose: an image model that recognises it would
// borrow from film casting or later chapters instead of the text the reader has seen.
const INSTRUCTIONS = (name: string) => `You write a prompt the reader will paste into an image generator to paint a portrait of ${name}, a character in a novel.
Use ONLY the passages you are given. Gather every detail they state or clearly imply about ${name}'s appearance: age, build, face, hair, skin, clothing, posture, typical expression, and the time period and place they live in. Never add details from later in the story, from adaptations, or from outside the passages, and never name the book, its author, or any real actor.
Where the passages say little about how ${name} looks, keep those features soft and understated (shadow, turned head, light from behind) rather than inventing them.
Write ONE paragraph of 80 to 160 words: a head-and-shoulders portrait, painterly and naturalistic, with a setting, light and mood that fit what the passages show about them. End with: "No text, no lettering, no borders."
Reply with ONLY that paragraph.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const raw = await text(owner.userId, {
      instructions: INSTRUCTIONS(input.name), effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Role: ${input.role || "unknown"}\nAlso called: ${input.aliases.join(", ") || "—"}\n\nPassages:\n${input.passages}` }],
    });
    const prompt = cleanPortraitPrompt(raw);
    if (!prompt) throw new AiError(502, "empty", "The portrait prompt couldn't be written. Please try again.");
    return NextResponse.json({ prompt });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "The portrait prompt couldn't be written. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
