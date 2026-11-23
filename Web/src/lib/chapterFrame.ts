type ChapterDocument = { body: { getBoundingClientRect(): { height: number } } };

// Measured from the body, not documentElement.scrollHeight: inside an iframe that never
// drops below the frame's own height, so the frame could grow but never shrink back.
export function chapterFrameHeight(doc: ChapterDocument): number {
  return Math.ceil(doc.body.getBoundingClientRect().height);
}
