import Foundation

/// Tri-state for inputs whose wire field distinguishes "absent" from a value.
enum AdvancedOptionalFlag: String, CaseIterable, Equatable, Sendable {
  case unset
  case on
  case off

  var value: Bool? {
    switch self {
    case .unset: nil
    case .on: true
    case .off: false
    }
  }

  init(_ value: Bool?) {
    switch value {
    case .none: self = .unset
    case .some(true): self = .on
    case .some(false): self = .off
    }
  }
}

enum AdvancedFormValidationError: Error, Equatable, Sendable {
  case missingRequiredField(AdvancedFormFieldKey)
  case invalidInteger(AdvancedFormFieldKey)
  case integerOutOfBounds(AdvancedFormFieldKey)
  case invalidSegment(index: Int)
  case missingSegmentField(index: Int)
  case ownerMismatch
  case missingOwnerLocation
}

/// Pure input parsing.
///
/// Values reach the wire verbatim: no Unicode normalization, no path
/// rewriting, and no trimming of identifiers. Whitespace is inspected only to
/// decide whether a required field was left blank.
enum AdvancedInputParsing {
  /// Largest integer that survives a JSON `number` round trip unchanged.
  static let maximumExactInteger: Int64 = 9_007_199_254_740_991

  static func isBlank(_ value: String) -> Bool {
    value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// Verbatim required value; blank input is a validation error.
  static func required(
    _ value: String?,
    _ key: AdvancedFormFieldKey
  ) throws -> String {
    guard let value, !isBlank(value) else {
      throw AdvancedFormValidationError.missingRequiredField(key)
    }
    return value
  }

  /// Verbatim optional value; blank input means the field is omitted.
  static func optional(_ value: String?) -> String? {
    guard let value, !isBlank(value) else { return nil }
    return value
  }

  static func int64(
    _ value: String?,
    _ key: AdvancedFormFieldKey
  ) throws -> Int64 {
    let raw = try required(value, key)
    guard let parsed = Int64(raw.trimmingCharacters(in: .whitespaces)) else {
      throw AdvancedFormValidationError.invalidInteger(key)
    }
    guard parsed >= -maximumExactInteger, parsed <= maximumExactInteger else {
      throw AdvancedFormValidationError.integerOutOfBounds(key)
    }
    return parsed
  }

  /// Millisecond timestamps travel as JSON numbers, so they stay inside the
  /// exact-integer range and never go negative.
  static func milliseconds(
    _ value: String?,
    _ key: AdvancedFormFieldKey
  ) throws -> Double {
    let parsed = try int64(value, key)
    guard parsed >= 0 else { throw AdvancedFormValidationError.integerOutOfBounds(key) }
    return Double(parsed)
  }

  static func lineNumber(
    _ value: String?,
    index: Int
  ) throws -> Int64 {
    guard let value, !isBlank(value),
      let parsed = Int64(value.trimmingCharacters(in: .whitespaces))
    else {
      throw AdvancedFormValidationError.missingSegmentField(index: index)
    }
    guard parsed >= 0, parsed <= maximumExactInteger else {
      throw AdvancedFormValidationError.invalidSegment(index: index)
    }
    return parsed
  }
}
