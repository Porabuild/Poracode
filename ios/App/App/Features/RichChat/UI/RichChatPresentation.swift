import Foundation

struct RichGoalPresentation: Equatable, Sendable {
  let objective: String
  let status: String
  let availableActions: Set<String>
}

enum RichImagePresentation: Equatable, Sendable, Identifiable {
  case inline(source: String, classification: RichInlineImageClassification)
  case local(path: String)
  case remote(RichRemoteImageReference)

  var id: String {
    switch self {
    case .inline(let source, _): "inline:\(source.hashValue)"
    case .local(let path): "local:\(path)"
    case .remote(let reference):
      "remote:\(reference.threadID):\(reference.itemID):\(reference.path.count)"
    }
  }
}

/// Display-ready context-window occupancy. Only ever built from values the
/// desktop actually reported — never from a local token estimate.
struct RichContextUsagePresentation: Equatable, Sendable {
  let usedTokens: Int64?
  let maxTokens: Int64
  let remainingTokens: Int64?
  let percent: Int?
}

enum RichPlanStepStatus: String, Equatable, Sendable {
  case pending
  case inProgress = "in_progress"
  case completed
}

struct RichPlanStepPresentation: Equatable, Sendable, Identifiable {
  let id: Int
  let text: String
  let status: RichPlanStepStatus
}

struct RichPlanPresentation: Equatable, Sendable {
  let sourceItemID: String
  let steps: [RichPlanStepPresentation]

  var completedCount: Int { steps.count { $0.status == .completed } }
  var isActive: Bool { steps.contains { $0.status == .inProgress } }
}

struct RichRuntimeErrorPresentation: Equatable, Sendable, Identifiable {
  let id: String
  let message: String
}

enum RichDelegatedAgentKind: String, Equatable, Sendable, Hashable, CaseIterable {
  case subagent
  case crossagent
  case workflow
}

struct RichDelegatedAgentPresentation: Equatable, Sendable, Identifiable {
  let id: String
  let kind: RichDelegatedAgentKind
  let title: String
  let stepCount: Int
}

enum RichMessageSupplementPresentation: Equatable, Sendable {
  case skill(name: String, pluginName: String?)
  case mcp(name: String)
  case thread(threadID: String, title: String)
  case diffComment(target: String, body: String)
  case file(path: String, name: String?, isAttachment: Bool)

}

enum RichChatPresentation {
  private static let preferredStreams = [
    "assistant_text", "reasoning_text", "plan_text", "command_output",
    "file_change_output",
  ]

  static func text(for item: RichRuntimeItem) -> String {
    if item.type == "question_answer" {
      return RichQuestionAnswerPresentation.text(for: item)
    }
    let stream = preferredStreams.compactMap { item.streams[$0] }
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n")
    if !stream.isEmpty { return stream }
    let blockText = (RichContentDecoder.decodeMessageContent(item.payload) ?? [])
      .compactMap(text)
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n")
    if !blockText.isEmpty { return blockText }
    guard let object = item.payload?.objectValue else { return "" }
    for key in ["title", "name", "summary", "message", "command", "path", "result"] {
      if let value = object[key]?.stringValue, !value.isEmpty { return value }
    }
    return ""
  }

  /// Visible message prose, kept separate from `text(for:)` because the latter
  /// is also the canonical copy/handoff representation and intentionally names
  /// skills, files, and images. Those structured blocks render as native cards
  /// instead of being duplicated inside the prose.
  static func messageBody(for item: RichRuntimeItem) -> String {
    let stream = preferredStreams.compactMap { item.streams[$0] }
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: "\n")
    if !stream.isEmpty { return stream }

    guard item.type == RichItemType.userMessage || item.type == RichItemType.assistantMessage else {
      return text(for: item)
    }
    var result = ""
    var crossedStructuredBlock = false
    for block in RichContentDecoder.decodeMessageContent(item.payload) ?? [] {
      guard case .text(let text) = block else {
        crossedStructuredBlock = true
        continue
      }
      if crossedStructuredBlock, !result.isEmpty {
        result = result.trimmingCharacters(in: .whitespaces)
        let suffix = text.trimmingCharacters(in: .whitespaces)
        if !suffix.isEmpty { result += " \(suffix)" }
      } else {
        result += text
      }
      crossedStructuredBlock = false
    }
    return result
  }

  static func messageSupplements(for item: RichRuntimeItem) -> [RichMessageSupplementPresentation] {
    guard item.type == RichItemType.userMessage || item.type == RichItemType.assistantMessage else {
      return []
    }
    return (RichContentDecoder.decodeMessageContent(item.payload) ?? []).compactMap {
      block -> RichMessageSupplementPresentation? in
      switch block {
      case .skill(let name, _, _, let pluginName):
        return RichMessageSupplementPresentation.skill(name: name, pluginName: pluginName)
      case .mcp(let name):
        return RichMessageSupplementPresentation.mcp(name: name)
      case .thread(let threadID, let title):
        return RichMessageSupplementPresentation.thread(threadID: threadID, title: title)
      case .diffComment(let path, let lineNumber, _, _, let body):
        return RichMessageSupplementPresentation.diffComment(
          target: "\(path):\(lineNumber)",
          body: body
        )
      case .file(let path, let name, let mimeType, let source):
        guard mimeType?.lowercased().hasPrefix("image/") != true else { return nil }
        return RichMessageSupplementPresentation.file(
          path: path,
          name: name,
          isAttachment: source == .attachment
        )
      case .text, .image:
        return nil
      }
    }
  }

  static func images(for item: RichRuntimeItem) -> [RichImagePresentation] {
    var values: [RichImagePresentation] = []
    for block in RichContentDecoder.decodeMessageContent(item.payload) ?? [] {
      switch block {
      case .image(_, let source, let path, _, _):
        if let classification = RichImagePolicy.classify(source) {
          values.append(.inline(source: source, classification: classification))
        } else if let path, !path.isEmpty {
          values.append(.local(path: path))
        }
      case .file(let path, _, let mimeType, _)
      where mimeType?.lowercased().hasPrefix("image/") == true:
        values.append(.local(path: path))
      default:
        break
      }
    }
    collectRemoteImages(item.payload, into: &values, depth: 0)
    var seen: Set<String> = []
    return values.filter { seen.insert($0.id).inserted }.prefix(8).map { $0 }
  }

  static func latestGoal(in items: [RichRuntimeItem]) -> RichGoalPresentation? {
    guard
      let payload = items.reversed().first(where: { $0.type == RichItemType.goal })?.payload?
        .objectValue,
      payload["action"]?.stringValue != "cleared",
      let objective = payload["objective"]?.stringValue?
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !objective.isEmpty
    else { return nil }
    let allowed = Set(["edit", "pause", "resume", "clear"])
    let actions = Set(
      (payload["availableActions"]?.arrayValue ?? []).compactMap(\.stringValue)
        .filter(allowed.contains)
    )
    return RichGoalPresentation(
      objective: objective,
      status: payload["status"]?.stringValue ?? "active",
      availableActions: actions
    )
  }

  static func latestActivePlan(in items: [RichRuntimeItem]) -> RichPlanPresentation? {
    for item in items.reversed() where item.type == RichItemType.plan {
      let steps = planSteps(item)
      guard !steps.isEmpty else { continue }
      guard !steps.allSatisfy({ $0.status == .completed }) else { return nil }
      return RichPlanPresentation(sourceItemID: item.id, steps: steps)
    }
    return nil
  }

  /// Runtime errors since the latest user message, matching the compact PWA's
  /// scope. Abort-only cancellation noise is intentionally omitted.
  static func recentErrors(in items: [RichRuntimeItem]) -> [RichRuntimeErrorPresentation] {
    var result: [RichRuntimeErrorPresentation] = []
    for item in items.reversed() {
      if item.type == RichItemType.userMessage { break }
      guard item.type == RichItemType.error,
        let message = item.payload?.objectValue?["message"]?.stringValue?
          .trimmingCharacters(in: .whitespacesAndNewlines),
        !message.isEmpty,
        message.range(
          of: #"^(?:error:\s*)?(?:aborterror:\s*)?aborted\.?$"#,
          options: [.regularExpression, .caseInsensitive]
        ) == nil
      else { continue }
      result.append(RichRuntimeErrorPresentation(id: item.id, message: message))
    }
    return result.reversed()
  }

  static func authenticationRequired(
    agentStatus: AgentStatusRecord?,
    recentErrors: [RichRuntimeErrorPresentation]
  ) -> Bool {
    guard let agentStatus else { return false }
    let presentationAuthState =
      agentStatus.raw["presentationAuthStates"]?.objectValue?["gui"]?.stringValue
      .flatMap(AgentStatusRecord.AuthState.init(rawValue:))
      ?? agentStatus.authState
    guard presentationAuthState != .authenticated else { return false }
    return presentationAuthState == .missing
      || recentErrors.contains { isAuthenticationError($0.message) }
  }

  static func visibleRecentErrors(
    _ errors: [RichRuntimeErrorPresentation],
    agentStatus: AgentStatusRecord?
  ) -> [RichRuntimeErrorPresentation] {
    guard authenticationRequired(agentStatus: agentStatus, recentErrors: errors) else {
      return errors
    }
    return errors.filter { !isAuthenticationError($0.message) }
  }

  static func activeDelegatedAgents(
    in items: [RichRuntimeItem]
  ) -> [RichDelegatedAgentPresentation] {
    let childCounts = Dictionary(
      grouping: items.compactMap { item in
        item.parentItemID.map { ($0, item.id) }
      }, by: \.0
    ).mapValues(\.count)

    return items.compactMap { item in
      guard item.parentItemID == nil,
        item.type == "tool_call",
        item.state != .completed,
        let payload = item.payload?.objectValue,
        let name = payload["name"]?.stringValue,
        !name.isEmpty,
        let kind = delegatedAgentKind(payload: payload, name: name)
      else { return nil }
      let arguments = payload["args"]?.objectValue
      let title =
        arguments?["description"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? payload["title"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        ?? name
      let reportedSteps = payload["progress"]?.objectValue?["stepCount"]?.exactInt64Value
      return RichDelegatedAgentPresentation(
        id: item.id,
        kind: kind,
        title: title.isEmpty ? name : title,
        stepCount: reportedSteps.map { max(0, Int(clamping: $0)) }
          ?? childCounts[item.id, default: 0]
      )
    }
  }

  static func completedTurnDuration(_ milliseconds: Int64) -> String? {
    guard milliseconds >= 1_000 else { return nil }
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits = milliseconds >= 3_600_000 ? [.hour, .minute] : [.minute, .second]
    formatter.unitsStyle = .abbreviated
    formatter.maximumUnitCount = 2
    formatter.zeroFormattingBehavior = .dropLeading
    return formatter.string(from: TimeInterval(milliseconds) / 1_000)
  }

  /// Mirrors the Android dock rule: a positive reported window plus at least one
  /// reported occupancy signal. Anything less stays hidden rather than guessed.
  static func contextUsage(_ usage: RichContextUsage?) -> RichContextUsagePresentation? {
    guard let usage, let maxTokens = usage.maxTokens,
      usage.usedTokens != nil || !(usage.breakdown ?? []).isEmpty
    else { return nil }
    let used = usage.usedTokens
    let percent = used.map {
      min(100, max(0, Int((Double($0) / Double(maxTokens) * 100).rounded())))
    }
    return RichContextUsagePresentation(
      usedTokens: used,
      maxTokens: maxTokens,
      remainingTokens: used.map { max(0, maxTokens - $0) },
      percent: percent
    )
  }

  static func requestResolution(
    request: RichOpenRequest,
    optionIDs: [String]
  ) -> RichChatRequestResolution? {
    guard let primary = optionIDs.first else { return nil }
    var response: [String: RichJSON] = ["optionId": .string(primary)]
    if optionIDs.count > 1 {
      response["optionIds"] = .array(optionIDs.map(RichJSON.string))
    }
    return RichChatRequestResolution(
      requestID: request.requestID,
      method: "requestPermission",
      response: .object(response)
    )
  }

  /// Matches the compact PWA composer: prose submitted while a regular
  /// approval is open declines that approval first, then becomes the next
  /// turn. Free-form questions and plan review remain on their dedicated
  /// request controls instead of being guessed from composer text.
  static func composerDenyResolution(
    for request: RichOpenRequest
  ) -> RichChatRequestResolution? {
    let approvalTypes: Set<RichRequestType> = [
      .commandExecutionApproval,
      .fileReadApproval,
      .fileChangeApproval,
      .applyPatchApproval,
      .toolCallApproval,
    ]
    guard approvalTypes.contains(request.type) else { return nil }
    if let toolName = request.payload.details?.objectValue?["toolName"]?.stringValue,
      toolName == "ExitPlanMode" || toolName == "exit_plan_mode"
    {
      return nil
    }
    let options =
      request.payload.options ?? [
        RichRequestOption(optionID: "allow", label: RichChatStrings.allow, description: nil),
        RichRequestOption(optionID: "deny", label: RichChatStrings.deny, description: nil),
      ]
    guard
      let deny = options.first(where: { option in
        let value = "\(option.optionID) \(option.label)".lowercased()
        return ["deny", "denied", "decline", "reject", "abort", "cancel"].contains {
          value.contains($0)
        }
      })
    else { return nil }
    return requestResolution(request: request, optionIDs: [deny.optionID])
  }

  static func typeLabel(for item: RichRuntimeItem) -> String {
    switch item.type {
    case RichItemType.userMessage: RichChatStrings.you
    case RichItemType.assistantMessage: RichChatStrings.assistant
    case RichItemType.reasoning: RichChatStrings.reasoning
    case "command_execution": RichChatStrings.command
    case "file_change": RichChatStrings.fileChanges
    case "web_search": RichChatStrings.webSearch
    case "image_view": RichChatStrings.image
    default: RichChatStrings.activity
    }
  }

  static func inlineImageData(
    source: String,
    classification: RichInlineImageClassification
  ) -> Data? {
    let encoded: String
    switch classification.kind {
    case .rawSVG:
      return nil
    case .base64:
      encoded = source
    case .dataURL:
      guard let comma = source.firstIndex(of: ","),
        source[..<comma].localizedCaseInsensitiveContains(";base64")
      else { return nil }
      encoded = String(source[source.index(after: comma)...])
    }
    return Data(base64Encoded: encoded, options: [.ignoreUnknownCharacters])
  }

  private static func text(_ block: RichContentBlock) -> String? {
    switch block {
    case .text(let text): text
    case .skill(_, let invocation, _, _): invocation
    case .mcp(let name): name
    case .thread(_, let title): "@\(title)"
    case .diffComment(let path, let line, _, _, let body): "\(path):\(line)\n\(body)"
    case .file(let path, let name, _, _): name ?? path
    case .image(_, _, let path, let name, _): name ?? path
    }
  }

  private static func planSteps(_ item: RichRuntimeItem) -> [RichPlanStepPresentation] {
    if let values = item.payload?.objectValue?["steps"]?.arrayValue {
      let steps = values.enumerated().compactMap { index, raw -> RichPlanStepPresentation? in
        guard let object = raw.objectValue,
          let text = object["step"]?.stringValue?.trimmingCharacters(
            in: .whitespacesAndNewlines
          ),
          !text.isEmpty,
          let rawStatus = object["status"]?.stringValue,
          let status = RichPlanStepStatus(rawValue: rawStatus)
        else { return nil }
        return RichPlanStepPresentation(id: index, text: text, status: status)
      }
      if !steps.isEmpty { return steps }
    }

    let text = item.streams["plan_text", default: ""]
    return text.split(whereSeparator: \.isNewline).enumerated().compactMap {
      index, rawLine -> RichPlanStepPresentation? in
      let line = String(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
      guard !line.isEmpty else { return nil }
      let pattern =
        #"^(?:(?:[-*+]|\d+[.)])\s+(?:\[([ xX~>])\]\s+)?|\[([ xX~>])\]\s+)(.+?)\s*$"#
      guard let expression = try? NSRegularExpression(pattern: pattern),
        let match = expression.firstMatch(
          in: line,
          range: NSRange(line.startIndex..., in: line)
        ),
        let textRange = Range(match.range(at: 3), in: line)
      else { return nil }
      let marker = [match.range(at: 1), match.range(at: 2)]
        .compactMap { Range($0, in: line).map { String(line[$0]) } }
        .first
      let status: RichPlanStepStatus =
        marker == "x" || marker == "X" ? .completed : marker == ">" ? .inProgress : .pending
      return RichPlanStepPresentation(
        id: index,
        text: String(line[textRange]).trimmingCharacters(in: .whitespacesAndNewlines),
        status: status
      )
    }
  }

  private static func isAuthenticationError(_ message: String) -> Bool {
    let normalized = message.lowercased()
    return normalized.contains("failed to authenticate")
      || normalized.contains("invalid authentication credentials")
      || normalized.contains("api error: 401")
      || normalized.contains("please run /login")
      || normalized.contains("session expired")
      || normalized.contains("authentication_failed")
      || normalized.contains("oauth_org_not_allowed")
      || normalized.range(of: #"\bnot logged in\b"#, options: .regularExpression) != nil
  }

  private static func delegatedAgentKind(
    payload: [String: RichJSON],
    name: String
  ) -> RichDelegatedAgentKind? {
    if name == "Workflow" { return .workflow }
    if payload["isCrossagent"]?.boolValue == true { return .crossagent }
    if payload["isSubAgent"]?.boolValue == true { return .subagent }
    let arguments = payload["args"]?.objectValue
    if ["subagent_type", "agent_type", "agentType"].contains(where: {
      arguments?[$0]?.stringValue?.isEmpty == false
    }) {
      return .subagent
    }
    return nil
  }

  private static func collectRemoteImages(
    _ value: RichJSON?,
    into output: inout [RichImagePresentation],
    depth: Int
  ) {
    guard let value, depth <= 8, output.count < 8 else { return }
    if let reference = RichImagePolicy.decodeRemoteReference(value) {
      output.append(.remote(reference))
      return
    }
    switch value {
    case .object(let object):
      for child in object.values { collectRemoteImages(child, into: &output, depth: depth + 1) }
    case .array(let array):
      for child in array { collectRemoteImages(child, into: &output, depth: depth + 1) }
    default:
      break
    }
  }
}
