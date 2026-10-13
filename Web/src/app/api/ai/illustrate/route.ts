import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";

const schema = z.object({ bookTitle: z.string().max(500), passage: z.string().min(8).max(3000) });

const INSTRUCTIONS = `You are a restrained, skilled illustrator who draws in SVG.
Draw one evocative illustration of the passage you are given: a clear subject, a sense of place, and a direction of light.
Rules: a single <svg> with viewBox="0 0 800 600"; flat shapes and soft linearGradient fills; a palette of 3 to 5 harmonious colors; no <script>, <image>, <foreignObject>, <text> or external references; under 8 KB.
Reply in exactly this form: a first line "CAPTION: " followed by one short sentence describing the picture, then a blank line, then ONLY the SVG markup.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const raw = await text(owner.userId, {
      instructions: INSTRUCTIONS, effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Book: ${input.bookTitle}\n\nPassage:\n${input.passage}` }],
    });
    const caption = raw.match(/^CAPTION:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const svg = raw.match(/<svg[\s\S]*<\/svg>/i)?.[0];
    if (!svg || svg.length > 60_000) throw new AiError(502, "no_svg", "The illustration couldn't be drawn. Please try again.");
    return NextResponse.json({ caption, svg });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "The illustration couldn't be drawn. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
