import XCTest
@testable import Reader

final class ReaderTextIndexTests: XCTestCase {
    func testSearchReturnsCanonicalCrossFormatLocator() throws {
        let index = ReaderTextIndex(
            publicationFingerprint: "book-sha",
            chunks: [
                PublicationTextChunk(
                    resourceID: "chapter-7",
                    title: "A Mad Tea-Party",
                    text: "There was a table set out under a tree in front of the house.",
                    ordinal: 6
                )
            ]
        )

        let result = try XCTUnwrap(index.search("TABLE").first)

        XCTAssertEqual(result.locator.schemaVersion, 1)
        XCTAssertEqual(result.locator.publicationFingerprint, "book-sha")
        XCTAssertEqual(result.locator.resourceID, "chapter-7")
        XCTAssertEqual(result.locator.position, 12)
        XCTAssertEqual(result.locator.textAnchor?.exact.lowercased(), "table")
        XCTAssertEqual(result.resourceTitle, "A Mad Tea-Party")
        XCTAssertTrue(result.excerpt.contains("table set out"))
    }

    func testSearchSpansResourcesAndHonorsLimit() {
        let index = ReaderTextIndex(
            publicationFingerprint: "book-sha",
            chunks: [
                PublicationTextChunk(
                    resourceID: "one",
                    title: "One",
                    text: "Alice Alice",
                    ordinal: 0
                ),
                PublicationTextChunk(
                    resourceID: "two",
                    title: "Two",
                    text: "Alice",
                    ordinal: 1
                )
            ]
        )

        let results = index.search("alice", limit: 2)

        XCTAssertEqual(results.count, 2)
        XCTAssertEqual(results.map(\.locator.resourceID), ["one", "one"])
    }

    func testBlankQueryReturnsNoResults() {
        let index = ReaderTextIndex(
            publicationFingerprint: "book-sha",
            chunks: []
        )

        XCTAssertTrue(index.search(" \n ").isEmpty)
    }

    func testSelectionContextIsBoundedAndCrossesResourceBoundaries() {
        let index = ReaderTextIndex(
            publicationFingerprint: "book-sha",
            chunks: [
                PublicationTextChunk(
                    resourceID: "one",
                    title: "One",
                    text: "Earlier context.",
                    ordinal: 0
                ),
                PublicationTextChunk(
                    resourceID: "two",
                    title: "Two",
                    text: "Before SELECTED after.",
                    ordinal: 1
                ),
                PublicationTextChunk(
                    resourceID: "three",
                    title: "Three",
                    text: "Later context.",
                    ordinal: 2
                ),
            ]
        )
        let selection = ReaderSelection(
            locator: ReaderLocator(
                publicationFingerprint: "book-sha",
                resourceID: "two",
                position: 7,
                progression: 0.3
            ),
            selectedText: "SELECTED"
        )

        let context = index.context(
            around: selection,
            maximumCharactersPerSide: 24
        )

        XCTAssertTrue(context.before.hasSuffix("Before "))
        XCTAssertTrue(context.before.contains("context."))
        XCTAssertTrue(context.after.hasPrefix(" after."))
        XCTAssertTrue(context.after.contains("Later"))
        XCTAssertLessThanOrEqual(context.before.count, 26)
        XCTAssertLessThanOrEqual(context.after.count, 26)
    }
}

// The web app (Web/src/lib/locator.ts) saves the reading place in this shape. These
// strings are copied from Web/tests/locator.test.ts; keep the two in step.
final class WebLocatorCompatibilityTests: XCTestCase {
    private func decode(_ json: String) throws -> ReaderLocator {
        try JSONDecoder().decode(ReaderLocator.self, from: Data(json.utf8))
    }

    func testWebLocatorsDecodeAsReaderLocators() throws {
        let fingerprint = String(repeating: "a", count: 64)
        let epub = try decode(
            #"{"schemaVersion":1,"publicationFingerprint":"\#(fingerprint)","resourceID":"id-idp140306299499120","position":2381,"progression":0.03,"rectangles":[]}"#
        )
        XCTAssertEqual(epub.schemaVersion, 1)
        XCTAssertEqual(epub.publicationFingerprint, fingerprint)
        XCTAssertEqual(epub.resourceID, "id-idp140306299499120")
        XCTAssertEqual(epub.position, 2381)
        XCTAssertEqual(epub.progression, 0.03, accuracy: 0.0001)
        XCTAssertNil(epub.textAnchor)
        XCTAssertTrue(epub.rectangles.isEmpty)

        let pdf = try decode(
            #"{"schemaVersion":1,"publicationFingerprint":"f","resourceID":"page-6","position":6,"progression":0.055,"rectangles":[]}"#
        )
        // The PDF adapter resolves a page from the "page-N" resource ID, else from position.
        XCTAssertTrue(pdf.resourceID.hasPrefix("page-"))
        XCTAssertEqual(Int(pdf.resourceID.dropFirst("page-".count)), pdf.position)

        let text = try decode(
            #"{"schemaVersion":1,"publicationFingerprint":"f","resourceID":"text","position":9000,"progression":0.4,"rectangles":[]}"#
        )
        XCTAssertEqual(text.resourceID, "text")
    }

    func testMacLocatorEncodesWithTheFieldNamesTheWebReads() throws {
        let locator = ReaderLocator(publicationFingerprint: "f", resourceID: "page-2", position: 2, progression: 0.25)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(locator)) as? [String: Any]
        )
        for key in ["schemaVersion", "publicationFingerprint", "resourceID", "position", "progression", "rectangles"] {
            XCTAssertNotNil(object[key], "missing \(key)")
        }
    }
}
