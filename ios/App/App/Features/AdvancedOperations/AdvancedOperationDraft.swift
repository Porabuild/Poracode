import Foundation

/// Editable state for one procedure form.
///
/// Owner-bound values are deliberately absent: the thread identifier and
/// project location always come from the captured lease, never from the form.
struct AdvancedOperationDraft: Equatable, Sendable {
  let procedure: AdvancedOperationProcedure
  var values: [AdvancedFormFieldKey: String]
  var flags: [AdvancedFormFlagKey: AdvancedOptionalFlag]
  var entryType: AdvancedProjectEntryType
  /// `false` omits the segments field entirely, which is distinct from
  /// sending an empty list.
  var includesSegments: Bool
  var segments: [AdvancedSegmentDraft]

  init(procedure: AdvancedOperationProcedure) {
    self.procedure = procedure
    values = [:]
    flags = Dictionary(
      uniqueKeysWithValues: AdvancedOperationsForm.flags(for: procedure).map {
        ($0.key, $0.isOptional ? AdvancedOptionalFlag.unset : .off)
      }
    )
    entryType = .file
    includesSegments = false
    segments = []
  }

  var fields: [AdvancedFormFieldDescriptor] {
    AdvancedOperationsForm.fields(for: procedure)
  }

  var flagDescriptors: [AdvancedFormFlagDescriptor] {
    AdvancedOperationsForm.flags(for: procedure)
  }

  var usesEntryType: Bool { AdvancedOperationsForm.usesEntryType(procedure) }
  var usesSegments: Bool { AdvancedOperationsForm.usesSegments(procedure) }

  func value(_ key: AdvancedFormFieldKey) -> String { values[key] ?? "" }

  func flag(_ key: AdvancedFormFlagKey) -> AdvancedOptionalFlag { flags[key] ?? .unset }

  mutating func setValue(_ value: String, for key: AdvancedFormFieldKey) {
    values[key] = value
  }

  mutating func setFlag(_ value: AdvancedOptionalFlag, for key: AdvancedFormFlagKey) {
    flags[key] = value
  }

  mutating func addSegment(_ kind: AdvancedSegmentKind) {
    includesSegments = true
    segments.append(AdvancedSegmentDraft(kind: kind))
  }

  mutating func removeSegment(_ id: UUID) {
    segments.removeAll { $0.id == id }
  }

  /// Whether every required field currently holds something non-blank. The
  /// authoritative check still happens in the request builder.
  var hasRequiredValues: Bool {
    fields.allSatisfy { field in
      !field.isRequired || !AdvancedInputParsing.isBlank(value(field.key))
    }
  }
}

extension AdvancedOperationOwner {
  var threadID: String? {
    switch self {
    case .thread(let threadID, _): threadID
    case .location(_, let threadID): threadID
    case .projectLocation: nil
    }
  }

  var location: ProjectLocation? {
    switch self {
    case .thread(_, let location): location
    case .location(let location, _): location
    case .projectLocation(let location): location
    }
  }
}
