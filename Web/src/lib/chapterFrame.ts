type ChapterDocument = { body: { getBoundingClientRect(): { height: number } } };

// Measured from the body, not documentElement.scrollHeight: inside an iframe that never
// drops below the frame's own height, so the frame could grow but never shrink back.
// The body must be `display: flow-root` (CHAPTER_CSS) so floated figures count.
export function chapterFrameHeight(doc: ChapterDocument): number {
  return Math.ceil(doc.body.getBoundingClientRect().height);
}
