import Foundation

/// Editable projection of generated, validated automation JSON. The generated
/// schedule-command codec is the authority for all limits and cross-field rules.
struct RemoteIntegrationsAutomationDraft: Equatable, Sendable {
  var mode = "new-thread"
  var targetThreadId = ""
  var maxRuntimeSeconds = 3600
  var maxIterations = 0
  var stopOnError = false
  var misfirePolicy = "coalesce"
  var retryKind = "none"
  var maxAttempts = 2
  var retryDelay = 30
  var maxRetryDelay = 300
  var stopWhen = ""
  var evaluateCompletion = false
  var confidenceThreshold = 0.9

  init(_ raw: JSONValue? = nil) {
    guard let raw else { return }
    mode = raw["mode"]?["kind"]?.stringValue ?? mode
    targetThreadId = raw["mode"]?["targetThreadId"]?.stringValue ?? ""
    maxRuntimeSeconds = raw["maxRuntimeSeconds"]?.scheduleInt ?? 3600
    maxIterations = raw["maxIterations"]?.scheduleInt ?? 0
    stopOnError = raw["stopOnError"] == .bool(true)
    misfirePolicy = raw["misfirePolicy"]?.stringValue ?? misfirePolicy
    retryKind = raw["retryPolicy"]?["kind"]?.stringValue ?? retryKind
    maxAttempts = raw["retryPolicy"]?["maxAttempts"]?.scheduleInt ?? 2
    retryDelay = raw["retryPolicy"]?["delaySeconds"]?.scheduleInt
      ?? raw["retryPolicy"]?["initialDelaySeconds"]?.scheduleInt ?? 30
    maxRetryDelay = raw["retryPolicy"]?["maxDelaySeconds"]?.scheduleInt ?? 300
    evaluateCompletion = raw["completionPolicy"]?["kind"]?.stringValue == "ai-evaluated"
    stopWhen = raw["completionPolicy"]?["stopWhen"]?.stringValue ?? ""
    confidenceThreshold = raw["completionPolicy"]?["confidenceThreshold"]?.scheduleNumber ?? 0.9
  }

  func completionIsAvailable(supported: Bool) -> Bool {
    mode != "heartbeat" || !evaluateCompletion || supported
  }

  var value: JSONValue {
    var retry: [String: JSONValue] = ["kind": .string(retryKind)]
    if retryKind != "none" {
      retry["maxAttempts"] = .number(Double(maxAttempts))
      if retryKind == "fixed" { retry["delaySeconds"] = .number(Double(retryDelay)) }
      else {
        retry["initialDelaySeconds"] = .number(Double(retryDelay))
        retry["maxDelaySeconds"] = .number(Double(maxRetryDelay))
      }
    }
    var target: [String: JSONValue] = ["kind": .string(mode)]
    if mode == "heartbeat" { target["targetThreadId"] = .string(targetThreadId) }
    let completion: JSONValue = mode == "heartbeat" && evaluateCompletion ? .object([
      "kind": .string("ai-evaluated"), "stopWhen": .string(stopWhen),
      "confidenceThreshold": .number(confidenceThreshold),
    ]) : .object(["kind": .string("none")])
    return .object([
      "version": .number(1), "mode": .object(target),
      "maxRuntimeSeconds": .number(Double(maxRuntimeSeconds)),
      "maxIterations": maxIterations == 0 ? .null : .number(Double(maxIterations)),
      "stopOnError": .bool(stopOnError), "misfirePolicy": .string(misfirePolicy),
      "retryPolicy": .object(retry), "completionPolicy": completion,
    ])
  }
}

extension JSONValue {
  var scheduleNumber: Double? { if case .number(let value) = self { value } else { nil } }
  var scheduleInt: Int? { scheduleNumber.map(Int.init) }
  var scheduleStrings: [String] { if case .array(let values) = self { values.compactMap(\.stringValue) } else { [] } }
}
