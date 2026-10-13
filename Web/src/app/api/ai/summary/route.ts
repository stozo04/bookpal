import { NextResponse } from "next/server";
import { aiBody, z } from "@/lib/ai/guardjson";
import { chunk, mapLimit, sseResponse, stream, text } from "@/lib/ai/run";

const schema = z.object({
  bookTitle: z.string().max(500),
  label: z.string().max(200).optional(), // where the reader is, e.g. "Chapter 4"
  text: z.string().min(40).max(1_500_000),
});

const NOTES = `You condense part of a book into faithful notes for a later summary. Use only this text.
Write at most 220 words: the events in order, the people involved, the places, and any threads left open. No opinions and no guesses.`;

const FINAL = (title: string, label: string | undefined, noted: boolean) => `You are writing "the story so far" for a reader of "${title}"${label ? `, who has read up to ${label}` : ""}.
${noted ? "You are given ordered notes that cover everything they have read." : "You are given the text they have read."}
Use only what it says: never add events, reveals or knowledge from beyond that point, and do not guess what happens next.
Write about 250 to 350 words in three to five short paragraphs of plain prose, then finish with one sentence on what is still unresolved.`;

export async function POST(request: Request) {
  const opened = await aiBody(request, schema);
  if (opened instanceof NextResponse) return opened;
  const { owner, input } = opened;

  return sseResponse(async (send, signal) => {
    const parts = chunk(input.text, 40_000);
    let material = input.text;
    if (parts.length > 1) {
      let done = 0;
      send("progress", { message: `Reading ${parts.length} parts…`, done, total: parts.length });
      const notes = await mapLimit(parts, 3, async (part, i) => {
        const note = await text(owner.userId, {
          instructions: NOTES, effort: "low", signal,
          input: [{ role: "user", content: `Book: ${input.bookTitle}\nPart ${i + 1} of ${parts.length}\n\n${part}` }],
        });
        send("progress", { message: `Read part ${++done} of ${parts.length}`, done, total: parts.length });
        return `Part ${i + 1}:\n${note}`;
      });
      material = notes.join("\n\n");
    }
    send("progress", { message: "Writing the summary…" });
    for await (const piece of stream(owner.userId, {
      instructions: FINAL(input.bookTitle, input.label, parts.length > 1), signal,
      input: [{ role: "user", content: material }],
    })) send("delta", { text: piece });
    send("done", {});
  });
}
