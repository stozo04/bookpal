// The reading place the web writes, in the shape of ReaderLocator in the Mac app
// (Reader/ReaderCore/ReadingTypes.swift, schemaVersion 1). Keep the two in step:
// ReaderTextIndexTests.testWebLocatorsDecodeAsReaderLocators decodes these exact shapes.
export type WebLocator = {
  schemaVersion: 1;
  publicationFingerprint: string;
  resourceID: string;
  position: number;
  progression: number;
  rectangles: [];
};

export function webLocator(fingerprint: string, resourceID: string, position: number, progression: number): WebLocator {
  return {
    schemaVersion: 1,
    publicationFingerprint: fingerprint,
    resourceID,
    position: Math.max(0, Math.round(position)),
    progression: Math.min(1, Math.max(0, progression)),
    rectangles: [],
  };
}
