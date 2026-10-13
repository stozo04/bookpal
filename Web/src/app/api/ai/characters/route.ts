import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { AiError, chunk, mapLimit, sseResponse, text } from "@/lib/ai/run";
import { parseCast, type CastResult } from "@/lib/ai/cast";

const schema = z.object({
  bookTitle: z.string().max(500),
  label: z.string().max(200).optional(),
  text: z.string().min(40).max(1_500_000),
});

const SHAPE = `Return ONLY JSON, no prose and no code fences, shaped exactly like:
{"characters":[{"name":"","aliases":[""],"role":"","description":"","relations":[{"with":"","type":""}]}]}
"role" is at most six words. "description" is one or two sentences. Each relation's "with" must exactly equal another character's "name" in your list; "type" is a short label such as "brother of", "employer", "rival", "mentor".`;

const EXTRACT = (title: string, label?: string) => `You build a cast list for "${title}"${label ? ` as of ${label}` : ""}, using ONLY the text provided.
Include the people who matter, at most 14. Never use knowledge from beyond this text: describe each person only by what the text has shown so far, so nothing is spoiled.
${SHAPE}`;

const MERGE = (title: string, label?: string) => `You merge partial cast lists for "${title}"${label ? ` as of ${label}` : ""} into one.
Treat the same person under different names as one (keep other names as aliases), keep at most 16 of the most important, let each description reflect everything known so far (no later knowledge), and keep only relations between people who remain in the list.
${SHAPE}`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;

  return sseResponse(async (send, signal) => {
    const ask = async (instructions: string, content: string, effort?: string): Promise<CastResult> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await text(owner.userId, {
          instructions, effort, signal,
          input: [{ role: "user", content: attempt === 0 ? content : `${content}\n\nYour last reply was not valid JSON in the required shape. Reply with ONLY the JSON.` }],
        });
        const parsed = parseCast(raw);
        if (parsed) return parsed;
      }
      throw new AiError(502, "bad_json", "The cast couldn't be put together. Please try again.");
    };

    const parts = chunk(input.text, 45_000);
    let final: CastResult;
    if (parts.length === 1) {
      send("progress", { message: "Finding the characters…" });
      final = await ask(EXTRACT(input.bookTitle, input.label), parts[0]);
    } else {
      let done = 0;
      send("progress", { message: `Reading ${parts.length} parts…`, done, total: parts.length });
      const partial = await mapLimit(parts, 3, async (part, i) => {
        const r = await ask(EXTRACT(input.bookTitle, input.label), `Part ${i + 1} of ${parts.length}\n\n${part}`, "low");
        send("progress", { message: `Read part ${++done} of ${parts.length}`, done, total: parts.length });
        return r;
      });
      send("progress", { message: "Bringing the cast together…" });
      final = await ask(MERGE(input.bookTitle, input.label), JSON.stringify(partial), "low");
    }

    // Keep only relations that point at someone in the final list.
    const names = new Set(final.characters.map((c) => c.name));
    for (const c of final.characters) c.relations = c.relations.filter((r) => names.has(r.with) && r.with !== c.name);
    send("result", final);
    send("done", {});
  });
}
