import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";
import { parseDefinition } from "@/lib/define";

const schema = z.object({
  bookTitle: z.string().max(500),
  word: z.string().trim().min(1).max(60),
  context: z.string().max(1500).optional(), // the passage around the word
});

const INSTRUCTIONS = `You define a word or short phrase for someone reading a book. Reply with JSON only, no other text:
{"word": the word in its dictionary form, "partOfSpeech": "noun" | "verb" | "adjective" | ..., "meaning": a plain one or two sentence definition, "inContext": what it means in the passage given (one sentence; empty if no passage was given or it is used in its ordinary sense), "example": a short example sentence of your own}
Do not reveal or guess any plot. If it is a name rather than a word, say who or what it is only if the passage shows it.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const raw = await text(owner.userId, {
      instructions: INSTRUCTIONS, effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Book: ${input.bookTitle}\nWord: ${input.word}${input.context ? `\n\nPassage:\n${input.context}` : ""}` }],
    });
    const definition = parseDefinition(raw, input.word);
    if (!definition) throw new AiError(502, "unreadable", "That word couldn’t be defined. Please try again.");
    return NextResponse.json({ definition });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "That word couldn’t be defined. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
