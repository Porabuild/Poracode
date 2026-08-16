import Foundation

struct RichCheckpointChangedFile: Sendable, Equatable {
  let path: String
  let oldPath: String?
  let status: String
}

struct RichCheckpoint: Sendable, Equatable, Identifiable {
  var id: String { checkpointItemID }
  let threadID: String
  let checkpointItemID: String
  let ref: String
  let commit: String
  let capturedAt: String
  let baseCheckpointItemID: String?
  let baseRef: String?
  let changedFiles: [RichCheckpointChangedFile]?

  var isTurn: Bool { baseCheckpointItemID != nil }
}

enum RichCheckpointDecoder {
  static func decode(_ value: RichJSON) throws -> RichCheckpoint {
    guard let object = value.objectValue,
      let threadID = RichDecoding.requiredString(object, "threadId", allowEmpty: false),
      let itemID = RichDecoding.requiredString(object, "checkpointItemId", allowEmpty: false),
      let ref = RichDecoding.requiredString(object, "ref", allowEmpty: false),
      let commit = RichDecoding.requiredString(object, "commit", allowEmpty: false),
      let capturedAt = RichDecoding.requiredString(object, "capturedAt", allowEmpty: false)
    else { throw RichDomainDecodeError.invalidCheckpoint }

    let baseID = RichDecoding.optionalString(object, "baseCheckpointItemId", allowEmpty: false)
    let baseRef = RichDecoding.optionalString(object, "baseRef", allowEmpty: false)
    let files = RichDecoding.optionalArray(object, "changedFiles")
    guard baseID != .invalid, baseRef != .invalid, files != .invalid else {
      throw RichDomainDecodeError.invalidCheckpoint
    }
    let hasAnyTurnField = baseID.value != nil || baseRef.value != nil || files.value != nil
    let hasEveryTurnField = baseID.value != nil && baseRef.value != nil && files.value != nil
    guard hasAnyTurnField == hasEveryTurnField else {
      throw RichDomainDecodeError.invalidCheckpoint
    }
    let changedFiles = try files.value?.map(decodeChangedFile)
    return RichCheckpoint(
      threadID: threadID,
      checkpointItemID: itemID,
      ref: ref,
      commit: commit,
      capturedAt: capturedAt,
      baseCheckpointItemID: baseID.value,
      baseRef: baseRef.value,
      changedFiles: changedFiles
    )
  }

  static func decodeList(_ value: RichJSON) throws -> [RichCheckpoint] {
    guard let values = value.arrayValue else { throw RichDomainDecodeError.invalidCheckpoint }
    return try values.map(decode)
  }

  private static func decodeChangedFile(_ value: RichJSON) throws -> RichCheckpointChangedFile {
    guard let object = value.objectValue,
      let path = RichDecoding.requiredString(object, "path", allowEmpty: false),
      let status = RichDecoding.requiredString(object, "status", allowEmpty: false)
    else { throw RichDomainDecodeError.invalidCheckpoint }
    let oldPath = RichDecoding.optionalString(object, "oldPath", allowEmpty: false)
    guard oldPath != .invalid else { throw RichDomainDecodeError.invalidCheckpoint }
    return RichCheckpointChangedFile(path: path, oldPath: oldPath.value, status: status)
  }
}
