import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, text } from "@/lib/ai/run";
import { parseProfile } from "@/lib/ai/profile";

const schema = z.object({
  bookTitle: z.string().max(500),
  label: z.string().max(200),
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).max(6).default([]),
  role: z.string().max(80).default(""),
  others: z.array(z.string().max(80)).max(30).default([]), // the rest of the cast, for relationships
  passages: z.string().min(20).max(60_000), // every place they appear so far
});

const INSTRUCTIONS = (i: { bookTitle: string; label: string; name: string }) => `You write a reader's profile of ${i.name} from "${i.bookTitle}", as of ${i.label}.
You are given the passages where ${i.name} appears, in order. Use ONLY those passages: never add anything from later in the book or from outside it, and do not guess. Where the passages do not say, leave it out.
Return ONLY JSON, no prose and no code fences, shaped exactly like:
{"summary":"3 to 5 sentences","traits":["up to 6 short traits"],"wants":"1 to 2 sentences on what they want or fear","timeline":[{"where":"chapter or early/middle/recent","event":"one short sentence"}],"relationships":[{"with":"another person's name","detail":"one sentence on how they relate"}],"quotes":[{"text":"a short line copied EXACTLY from the passages","where":"where it comes from"}]}
Give 4 to 8 timeline entries in story order, up to 8 relationships (prefer people from the cast list), and up to 3 quotes, each under 200 characters and word-for-word.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;
  try {
    const ask = (extra = "") => text(owner.userId, {
      instructions: INSTRUCTIONS(input), effort: "low", signal: request.signal,
      input: [{ role: "user", content: `Role: ${input.role || "unknown"}\nAlso called: ${input.aliases.join(", ") || "—"}\nOther people in the cast: ${input.others.join(", ") || "—"}\n\nPassages:\n${input.passages}${extra}` }],
    });
    let profile = parseProfile(await ask(), input.passages);
    if (!profile) profile = parseProfile(await ask("\n\nYour last reply was not valid JSON in the required shape. Reply with ONLY the JSON."), input.passages);
    if (!profile) throw new AiError(502, "bad_json", "The profile couldn't be put together. Please try again.");
    return NextResponse.json({ profile });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError(502, "failed", "The profile couldn't be put together. Please try again.");
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
