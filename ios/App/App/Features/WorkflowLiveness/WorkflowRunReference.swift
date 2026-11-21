import Foundation

/// Only the canonical workflow field supplies this read reference. Tool names,
/// scripts and provider result text are not interpreted by a native client.
struct WorkflowRunReference: Equatable, Hashable, Sendable {
  let runID: String
  let transcriptDirectory: String
  let manifestPath: String

  init?(metadata: RichJSON?) {
    guard let object = metadata?.objectValue,
      let rawID = object["runId"]?.stringValue,
      let rawDirectory = object["transcriptDir"]?.stringValue else { return nil }
    let runID = rawID.trimmingCharacters(in: .whitespacesAndNewlines)
    var directory = rawDirectory.trimmingCharacters(in: .whitespacesAndNewlines)
    while directory.last == "/" || directory.last == "\\" { directory.removeLast() }
    guard !runID.isEmpty, !directory.isEmpty, ![".", ".."].contains(runID),
      !runID.contains("/"), !runID.contains("\\"), !runID.contains("\0"), !directory.contains("\0"),
      let expression = Self.layout,
      let match = expression.firstMatch(in: directory, range: NSRange(directory.startIndex..., in: directory)) else { return nil }
    let path = directory as NSString
    let parent = path.substring(with: match.range(at: 1))
    let separator = path.substring(with: match.range(at: 2))
    guard !parent.isEmpty, path.substring(with: match.range(at: 3)) == runID else { return nil }
    self.runID = runID
    transcriptDirectory = directory
    manifestPath = parent + separator + "workflows" + separator + runID + ".json"
  }

  private static let layout = try? NSRegularExpression(
    pattern: #"^(.*?)([\\/])subagents[\\/]workflows[\\/]([^\\/]+)$"#)
}
