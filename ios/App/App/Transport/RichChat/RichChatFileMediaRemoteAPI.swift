import Foundation

/// Result of a streamed attachment download: the unique private file the
/// caller keeps alive until the share sheet finishes, then removes the
/// directory this operation created.
struct RichChatFileDownload: Sendable, Equatable {
  let directory: URL
  let fileURL: URL
  let fileName: String
  let sizeBytes: Int64
}
