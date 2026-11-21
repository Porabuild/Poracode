import Foundation
import Observation

struct RichChatRequestForm: Equatable {
  enum Response: Equatable {
    case answers, nestedAnswers, elicitation
    case externalURL(id: String)
  }

  struct Link: Equatable, Identifiable {
    let url: URL
    let title: String
    let description: String?
    var id: URL { url }
  }

  let response: Response
  let message: String
  let source: String?
  let fields: [RichChatRequestFormField]
  let links: [Link]
  let metadata: RichJSON?

  var cancelResponse: RichJSON {
    .object(["action": .string(isQuestion ? "cancel" : "decline")])
  }

  var isQuestion: Bool { response == .answers || response == .nestedAnswers }

  var requiresExternalVisit: Bool {
    if case .externalURL = response { return true }
    return false
  }

  private static let elicitationKeys = ["structuredElicitation", "mcpElicitation", "acpElicitation"]

  static func recognizesPayload(_ request: RichOpenRequest) -> Bool {
    guard request.type == .toolUserInput, let details = request.payload.details?.objectValue else { return false }
    return details["userInputForm"] != nil || elicitationKeys.contains { details[$0] != nil }
      || elicitation(in: details) != nil || legacyQuestions(in: details) != nil
  }

  init?(request: RichOpenRequest) {
    guard request.type == .toolUserInput, let details = request.payload.details?.objectValue else { return nil }
    if let elicitation = Self.elicitation(in: details) {
      let mode = elicitation["mode"]?.stringValue
      guard let message = elicitation["message"]?.stringValue else { return nil }
      self.message = message
      source = elicitation["sourceText"]?.stringValue ?? elicitation["serverName"]?.stringValue
        ?? elicitation["agentName"]?.stringValue
      metadata = elicitation["_meta"]
      if mode == "url", let url = Self.webURL(elicitation["url"]),
        let id = elicitation["elicitationId"]?.stringValue {
        response = .externalURL(id: id)
        fields = []
        links = [Link(url: url, title: RichChatStrings.openRequiredURL, description: url.host)]
      } else if mode == "form", let schema = elicitation["requestedSchema"]?.objectValue,
        schema["type"] == nil || schema["type"] == .string("object")
      {
        let required = Set(schema["required"]?.arrayValue?.compactMap(\.stringValue) ?? [])
        guard schema["properties"] == nil || schema["properties"]?.objectValue != nil else { return nil }
        let properties = schema["properties"]?.objectValue ?? [:]
        let decoded = properties.keys.sorted().compactMap { key in
          properties[key]?.objectValue.flatMap { RichChatRequestFormField(id: key, schema: $0, required: required.contains(key)) }
        }
        guard decoded.count == properties.count, required.isSubset(of: properties.keys) else { return nil }
        response = .elicitation
        fields = decoded
        var seen: Set<URL> = []
        links = (elicitation["links"]?.arrayValue ?? []).compactMap { raw in
          guard let link = raw.objectValue, let url = Self.webURL(link["url"]),
            let title = link["title"]?.stringValue, seen.insert(url).inserted
          else { return nil }
          return Link(url: url, title: title, description: link["description"]?.stringValue)
        }
      } else {
        return nil
      }
      return
    }

    // Earlier pending items wrap the same questions array and expect each answer
    // inside an array-bearing object. The normalized form uses the answer map.
    let normalized = details["userInputForm"]?.objectValue?["questions"]?.arrayValue
    let nested = Self.legacyQuestions(in: details)
    let candidates: [(Response, [RichJSON]?)] = [(.answers, normalized), (.nestedAnswers, nested)]
    for (shape, raw) in candidates {
      var seen: Set<String> = []
      let questions = (raw ?? []).compactMap { value -> RichChatRequestFormField? in
        guard let field = value.objectValue.flatMap({ RichChatRequestFormField(question: $0, legacy: shape == .nestedAnswers) }),
          seen.insert(field.id).inserted else { return nil }
        return field
      }
      guard !questions.isEmpty else { continue }
      response = shape
      message = request.payload.summary
      source = nil
      fields = questions
      links = []
      metadata = nil
      return
    }
    return nil
  }

  private static func elicitation(in details: [String: RichJSON]) -> [String: RichJSON]? {
    for key in elicitationKeys {
      if let envelope = details[key]?.objectValue { return envelope }
    }
    return details["mode"] != nil && details["serverName"] != nil ? details : nil
  }

  private static func legacyQuestions(in details: [String: RichJSON]) -> [RichJSON]? {
    guard details.count == 1, details["userInputForm"] == nil else { return nil }
    return details.values.first?.objectValue?["questions"]?.arrayValue
  }

  private static func webURL(_ value: RichJSON?) -> URL? {
    guard let raw = value?.stringValue, let url = URL(string: raw), url.host != nil,
      ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
    return url
  }

  func submit(_ values: [String: RichJSON]) -> RichJSON? {
    let visible = fields.filter { $0.isVisible(values) }
    guard !requiresExternalVisit, visible.allSatisfy({ $0.isValid(values[$0.id]) }) else { return nil }
    if isQuestion {
      let answers = visible.reduce(into: [String: RichJSON]()) { answers, field in
        guard let value = values[field.id] else { return }
        if response == .nestedAnswers {
          answers[field.id] = .object(["answers": .array(value.arrayValue ?? [value])])
        } else {
          answers[field.id] = value
        }
      }
      return .object(["answers": .object(answers)])
    }
    let content = visible.reduce(into: [String: RichJSON]()) { content, field in
      if let value = values[field.id], !field.isEmpty(value) { content[field.id] = value }
    }
    var result: [String: RichJSON] = ["action": .string("accept"), "content": .object(content)]
    if let metadata { result["_meta"] = metadata }
    return .object(result)
  }
}

struct RichChatExternalRequestVisit: Equatable {
  let target: RichChatThreadTarget
  let requestID: RichRequestID
  let form: RichChatRequestForm

  func needsRebind(to current: RichChatThreadTarget) -> Bool {
    target.threadID == current.threadID && target.lease.connectionID == current.lease.connectionID
      && target.lease.generation != current.lease.generation
  }

  func matchingRequest(in requests: [RichOpenRequest]) -> RichOpenRequest? {
    requests.first { $0.threadID == target.threadID && $0.id == requestID && RichChatRequestForm(request: $0) == form }
  }
}

/// The owning conversation keeps this in memory while the request is open.
@MainActor @Observable
final class RichChatRequestFormDraft: Identifiable {
  let request: RichOpenRequest
  let form: RichChatRequestForm
  var values: [String: RichJSON]
  var custom: [String: String] = [:]
  var numericText: [String: String] = [:]
  var additionalItem: [String: String] = [:]
  var submitted = false
  var id: RichRequestID { request.id }

  init(request: RichOpenRequest, form: RichChatRequestForm) {
    self.request = request
    self.form = form
    values = Dictionary(uniqueKeysWithValues: form.fields.map { ($0.id, $0.initialValue) })
  }

  var response: RichJSON? {
    guard !form.fields.contains(where: { field in
      field.isVisible(values) && !(additionalItem[field.id] ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }) else { return nil }
    return form.submit(values)
  }

  func choose(_ option: String, in field: RichChatRequestFormField) {
    if field.kind == .array {
      var entries = values[field.id]?.arrayValue ?? []
      if let index = entries.firstIndex(of: .string(option)) { entries.remove(at: index) }
      else { entries.append(.string(option)) }
      values[field.id] = .array(entries)
    } else {
      custom.removeValue(forKey: field.id)
      let choice = RichJSON.string(option)
      values[field.id] = !field.required && values[field.id] == choice ? .string("") : choice
    }
  }

  func editCustom(_ text: String, in field: RichChatRequestFormField) {
    custom[field.id] = text
    let value = form.isQuestion ? text.trimmingCharacters(in: .whitespacesAndNewlines) : text
    values[field.id] = .string(value)
  }

  func editNumber(_ text: String, in field: RichChatRequestFormField) {
    numericText[field.id] = text
    let canonical = text.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: Locale.current.decimalSeparator ?? ".", with: ".")
    if canonical.isEmpty {
      values[field.id] = .string("")
    } else if let number = Double(canonical), number.isFinite,
      let decimal = Decimal(string: canonical, locale: Locale(identifier: "en_US_POSIX"))
    {
      values[field.id] = .number(decimal)
    } else {
      values[field.id] = .null
    }
  }
}
