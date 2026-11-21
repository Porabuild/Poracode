import Foundation

struct RichChatRequestFormField: Identifiable, Equatable {
  enum Kind: String {
    case string, integer, number, boolean, array
  }

  struct Option: Identifiable, Equatable {
    let id: String
    let label: String
    let description: String?
  }

  let id: String
  let title: String
  let description: String?
  let placeholder: String?
  let kind: Kind
  let options: [Option]
  let allowsCustom: Bool
  let secret: Bool
  let required: Bool
  let initialValue: RichJSON
  private let schema: [String: RichJSON]?

  init?(question: [String: RichJSON], legacy: Bool) {
    guard let prompt = RichDecoding.requiredString(question, "question", allowEmpty: false) else { return nil }
    id = RichDecoding.requiredString(question, "id", allowEmpty: false) ?? prompt
    title = RichDecoding.requiredString(question, "header", allowEmpty: false) ?? (legacy ? prompt : id)
    description = prompt == title ? nil : prompt
    placeholder = nil
    var seen: Set<String> = []
    options = (question["options"]?.arrayValue ?? []).compactMap { item in
      guard let object = item.objectValue, let label = RichDecoding.requiredString(object, "label", allowEmpty: false)
      else { return nil }
      let key = RichDecoding.requiredString(object, "optionId", allowEmpty: false) ?? label
      guard seen.insert(key).inserted else { return nil }
      return Option(id: key, label: label, description: object["description"]?.stringValue)
    }
    kind = !options.isEmpty && question["multiSelect"] == .bool(true) ? .array : .string
    allowsCustom = true
    secret = question["isSecret"] == .bool(true)
    required = true
    initialValue = kind == .array ? .array([]) : .string("")
    schema = nil
  }

  init?(id: String, schema: [String: RichJSON], required: Bool) {
    guard let raw = schema["type"]?.stringValue, let kind = Kind(rawValue: raw) else { return nil }
    self.id = id
    self.kind = kind
    self.required = required
    self.schema = schema
    title = schema["title"]?.stringValue ?? id
    description = schema["description"]?.stringValue
    placeholder = schema["placeholder"]?.stringValue
    secret = false
    let source = kind == .array ? (schema["items"]?.objectValue ?? [:]) : schema
    options = Self.options(in: source)
    allowsCustom = schema["allowCustom"] == .bool(true) || (kind == .array && options.isEmpty)
    let fallback: RichJSON = kind == .boolean ? .bool(false) : kind == .array ? .array([]) : .string("")
    initialValue = schema["default"] == .null ? fallback : schema["default"] ?? fallback
  }

  var isQuestion: Bool { schema == nil }

  func isVisible(_ values: [String: RichJSON]) -> Bool {
    (schema?["visibleWhen"]?.arrayValue ?? []).allSatisfy { entry in
      guard let rule = entry.objectValue, let key = rule["field"]?.stringValue else { return true }
      if let expected = rule["equals"] { return values[key] == expected }
      return values[key] != rule["notEquals"]
    }
  }

  func isEmpty(_ value: RichJSON) -> Bool {
    if let text = value.stringValue {
      return isQuestion ? text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty : text.isEmpty
    }
    return value.arrayValue?.isEmpty == true
  }

  func isValid(_ value: RichJSON?) -> Bool {
    guard let value, !isEmpty(value) else { return !required }
    if isQuestion, kind == .array, value.stringValue != nil { return allowsCustom }
    switch kind {
    case .string:
      guard let text = value.stringValue, allows(text) else { return false }
      return within(Decimal(text.utf16.count), minimum: "minLength", maximum: "maxLength") && validFormat(text)
    case .array:
      guard let entries = value.arrayValue, entries.allSatisfy({ $0.stringValue.map(allows) == true })
      else { return false }
      return within(Decimal(entries.count), minimum: "minItems", maximum: "maxItems")
    case .boolean:
      return value.boolValue != nil
    case .integer, .number:
      guard var number = value.decimalValue, !number.isNaN,
        within(number, minimum: "minimum", maximum: "maximum")
      else { return false }
      if kind == .integer {
        var whole = Decimal()
        NSDecimalRound(&whole, &number, 0, .plain)
        return number == whole
      }
      return true
    }
  }

  private func within(_ value: Decimal, minimum: String, maximum: String) -> Bool {
    if let lower = schema?[minimum]?.decimalValue, value < lower { return false }
    if let upper = schema?[maximum]?.decimalValue, value > upper { return false }
    return true
  }

  private func allows(_ value: String) -> Bool {
    allowsCustom || options.isEmpty || options.contains { $0.id == value }
  }

  private func validFormat(_ text: String) -> Bool {
    switch schema?["format"]?.stringValue {
    case "email":
      return text.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
    case "uri":
      return URL(string: text)?.scheme != nil
    case "date":
      let parser = ISO8601DateFormatter()
      parser.formatOptions = [.withFullDate]
      return parser.date(from: text) != nil
    case "date-time":
      let parser = ISO8601DateFormatter()
      if parser.date(from: text) != nil { return true }
      parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      return parser.date(from: text) != nil
    default:
      return true
    }
  }

  private static func options(in source: [String: RichJSON]) -> [Option] {
    let choices = source["oneOf"]?.arrayValue ?? source["anyOf"]?.arrayValue ?? []
    var seen: Set<String> = []
    let decoded = choices.compactMap { value -> Option? in
      guard let choice = value.objectValue, let key = choice["const"]?.stringValue,
        seen.insert(key).inserted else { return nil }
      return Option(id: key, label: choice["title"]?.stringValue ?? key, description: nil)
    }
    if !decoded.isEmpty { return decoded }

    let names = source["enumNames"]?.arrayValue ?? []
    return (source["enum"]?.arrayValue ?? []).enumerated().compactMap { index, value in
      guard let key = value.stringValue, seen.insert(key).inserted else { return nil }
      let label = names.indices.contains(index) ? names[index].stringValue ?? key : key
      return Option(id: key, label: label, description: nil)
    }
  }
}
