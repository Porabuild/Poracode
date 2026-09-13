import XCTest

@testable import App

/// Cursor-sync v2 chunk assembly rules, mirroring the shared
/// `TerminalWatchSessionV2.handleChunk` fixture semantics (and the Android
/// `TerminalBaselineAssemblerTest`): strict ordering, duplicate tolerance,
/// discard on any discontinuity, one completion frame.
final class TerminalBaselineAssemblerTests: XCTestCase {
  func testAssemblesContiguousChunksIntoOneBaselineFrameAndAcksEach() {
    var assembler = TerminalBaselineAssembler()
    XCTAssertEqual(
      assembler.offer(chunk(index: 0, from: 100, to: 103, data: "abc")),
      .acknowledge(throughCursor: 103)
    )
    XCTAssertEqual(
      assembler.offer(chunk(index: 1, from: 103, to: 106, data: "def")),
      .acknowledge(throughCursor: 106)
    )
    guard case .complete(let frame, let throughCursor) = assembler.offer(
      chunk(index: 2, from: 106, to: 108, data: "gh")
    )
    else { return XCTFail("Expected completion") }
    XCTAssertEqual(throughCursor, 108)
    XCTAssertEqual(frame.kind, .baseline)
    XCTAssertEqual(frame.watchID, "watch-2")
    XCTAssertEqual(frame.generation, "generation-1")
    XCTAssertEqual(frame.fromCursor, 100)
    XCTAssertEqual(frame.toCursor, 108)
    XCTAssertEqual(frame.data, "abcdefgh")
  }

  func testDuplicateIndicesAreIgnoredWithoutReacknowledging() {
    var assembler = TerminalBaselineAssembler()
    _ = assembler.offer(chunk(index: 0, from: 100, to: 103, data: "abc"))
    XCTAssertEqual(
      assembler.offer(chunk(index: 0, from: 100, to: 103, data: "abc")),
      .duplicate
    )
    // The stream continues undisturbed after a duplicate.
    XCTAssertEqual(
      assembler.offer(chunk(index: 1, from: 103, to: 106, data: "def")),
      .acknowledge(throughCursor: 106)
    )
  }

  func testGapsAndGenerationChangesAndResumeFlipsDiscardTheAssembly() {
    var gap = TerminalBaselineAssembler()
    _ = gap.offer(chunk(index: 0, from: 100, to: 103, data: "abc"))
    XCTAssertEqual(
      gap.offer(chunk(index: 1, from: 104, to: 106, data: "ef")),
      .discard
    )
    // Discard resets: the next chunk starts a fresh assembly.
    XCTAssertEqual(
      gap.offer(chunk(index: 0, from: 108, to: 110, data: "ij")),
      .acknowledge(throughCursor: 110)
    )

    var generationChange = TerminalBaselineAssembler()
    _ = generationChange.offer(chunk(index: 0, from: 100, to: 103, data: "abc"))
    XCTAssertEqual(
      generationChange.offer(chunk(index: 1, from: 103, to: 106, data: "def", generation: "other")),
      .discard
    )

    var resumeFlip = TerminalBaselineAssembler()
    _ = resumeFlip.offer(chunk(index: 0, from: 100, to: 103, data: "abc", resume: true))
    XCTAssertEqual(
      resumeFlip.offer(chunk(index: 1, from: 103, to: 106, data: "def")),
      .discard
    )
  }

  func testOverflowMidStreamDiscardsAndSingleUpToDateResumeChunkCompletesEmpty() {
    // count = 3 keeps chunk 1 mid-stream, matching the shared handleChunk
    // overflow rule (evaluated only while the stream is in flight).
    var overflow = TerminalBaselineAssembler(maximumAssemblyUTF16Units: 5)
    _ = overflow.offer(chunk(index: 0, from: 0, to: 3, data: "abc", count: 3))
    XCTAssertEqual(
      overflow.offer(chunk(index: 1, from: 3, to: 7, data: "defg", count: 3)),
      .discard
    )
    // Discard resets: the next chunk starts a fresh assembly.
    XCTAssertEqual(
      overflow.offer(chunk(index: 0, from: 7, to: 9, data: "hi", count: 2)),
      .acknowledge(throughCursor: 9)
    )

    // Mirror note: a FINAL chunk that completes the assembly is delivered
    // even when its cumulative units exceed the budget — the shared
    // handleChunk evaluates overflow only for mid-stream chunks.
    var finalOverflow = TerminalBaselineAssembler(maximumAssemblyUTF16Units: 5)
    _ = finalOverflow.offer(chunk(index: 0, from: 0, to: 3, data: "abc", count: 2))
    guard case .complete(let frame, _) = finalOverflow.offer(
      chunk(index: 1, from: 3, to: 7, data: "defg", count: 2)
    )
    else { return XCTFail("Expected completion") }
    XCTAssertEqual(frame.data, "abcdefg")

    var upToDate = TerminalBaselineAssembler()
    guard case .complete(let marker, let throughCursor) = upToDate.offer(
      chunk(index: 0, from: 108, to: 108, data: "", count: 1, resume: true)
    )
    else { return XCTFail("Expected completion") }
    XCTAssertEqual(marker.data, "")
    XCTAssertEqual(marker.fromCursor, 108)
    XCTAssertEqual(marker.toCursor, 108)
    XCTAssertEqual(marker.generation, "generation-1")
    XCTAssertEqual(throughCursor, 108)
  }

  private func chunk(
    index: Int,
    from: Int64,
    to: Int64,
    data: String,
    count: Int = 3,
    generation: String = "generation-1",
    resume: Bool = false
  ) -> TerminalBaselineChunk {
    TerminalBaselineChunk(
      terminalID: "terminal-1",
      watchID: "watch-2",
      generation: generation,
      chunkIndex: index,
      chunkCount: count,
      fromCursor: from,
      toCursor: to,
      data: data,
      resumeServed: resume
    )
  }
}
