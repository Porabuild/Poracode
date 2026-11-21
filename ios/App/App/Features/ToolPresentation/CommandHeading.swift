import Foundation

/// Read-only, generated-codec-validated heading meaning. No provider or shell parsing.
struct RichRuntimeItemHeading: Sendable, Equatable {
  let kind: String
  let title: RichJSON
  let path: String?
  let filePath: Bool
  let additionalActions: Int
  let failed: Bool
  let durationMs: Double?
  var workflowMetadata: RichJSON? = nil
  var workflowView: RichJSON? = nil

  init?(_ value: RichJSON) {
    if let view = value.objectValue?["workflowView"], RichWorkflowViewPlan(view) != nil {
      kind = "workflow-view"; title = .object([:]); path = nil; filePath = false
      additionalActions = 0; failed = false; durationMs = nil; workflowView = view
      return
    }
    if let metadata = value.objectValue?["workflow"], WorkflowRunReference(metadata: metadata) != nil {
      kind = "workflow-registration"; title = .object([:]); path = nil; filePath = false
      additionalActions = 0; failed = false; durationMs = nil; workflowMetadata = metadata
      return
    }
    if let header = value.objectValue, let tool = header["tool"]?.objectValue {
      guard tool["kind"]?.stringValue == "mcp", let text = tool["title"]?.stringValue,
        let failed = header["failed"]?.boolValue else { return nil }
      kind = "mcp"; title = .object(["kind": .string("mcp"), "text": .string(text)])
      self.failed = failed; path = nil; filePath = false; additionalActions = 0; durationMs = nil
      return
    }
    guard let header = value.objectValue, let command = header["command"]?.objectValue,
      let kind = command["kind"]?.stringValue,
      Set(["check", "command", "git", "install", "list", "package", "search", "view"]).contains(kind),
      let title = command["title"], let titleKind = title.objectValue?["kind"]?.stringValue,
      Set(["label", "view", "search"]).contains(titleKind), let failed = header["failed"]?.boolValue else { return nil }
    self.kind = kind; self.title = title; self.failed = failed
    path = command["path"]?.objectValue?["path"]?.stringValue
    filePath = command["path"]?.objectValue?["filePath"]?.boolValue ?? false
    additionalActions = Int(clamping: command["additionalActions"]?.exactInt64Value ?? 0)
    durationMs = header["durationMs"]?.decimalValue.map { NSDecimalNumber(decimal: $0).doubleValue }
  }

  var viewPrefix: String {
    let lines = title.objectValue?["lines"]?.stringValue?.replacingOccurrences(of: "-", with: ":")
    return ToolPresentationStrings.label("view") + (lines.map { " \($0)" } ?? "") + ": "
  }

  var displayTitle: String {
    let object = title.objectValue ?? [:]
    let text: String
    switch object["kind"]?.stringValue {
    case "mcp": text = object["text"]?.stringValue ?? ""
    case "view": text = viewPrefix + (object["text"]?.stringValue ?? "")
    case "search":
      let query = object["query"]?.stringValue ?? ""
      let search = object["scope"]?.stringValue.map { ToolPresentationStrings.search(query, in: $0) }
        ?? "\(ToolPresentationStrings.label("search")): \"\(query)\""
      let count = object["additionalPatterns"]?.exactInt64Value ?? 0
      text = search + (count > 0 ? " +\(count)" : "")
    default:
      text = ToolPresentationStrings.label(object["label"]?.stringValue ?? "run")
        + (object["text"]?.stringValue.map { ": \($0)" } ?? "")
    }
    return text + (additionalActions > 0 ? " +\(additionalActions)" : "")
  }

  var category: RichChatStrings.RichChatActivityCategory {
    switch kind { case "view", "list": .view; case "search": .search; case "mcp": .mcp; default: .command }
  }
  var storageBytes: Int { ((try? JSONEncoder().encode(title).count) ?? 0) + ((try? JSONEncoder().encode(workflowMetadata).count) ?? 0) + ((try? JSONEncoder().encode(workflowView).count) ?? 0) + (path?.utf8.count ?? 0) + 256 }
  var durationText: String? {
    guard let durationMs else { return nil }
    let seconds = durationMs >= 1000
    let formatter = NumberFormatter()
    formatter.usesGroupingSeparator = false
    formatter.minimumFractionDigits = seconds ? 1 : 0
    formatter.maximumFractionDigits = seconds ? 1 : 16
    guard let number = formatter.string(from: NSNumber(value: seconds ? durationMs / 1000 : durationMs)) else { return nil }
    return number + (seconds ? UnitDuration.seconds.symbol : UnitDuration.milliseconds.symbol)
  }
  var icon: RichChatIcon.Kind {
    switch kind {
    case "mcp": .mcp
    case "view": .view
    case "search": .search
    case "list": .list
    case "check": .check
    case "install", "package": .package
    case "git": .gitBranch
    default: .command
    }
  }
}

struct RichRuntimeItemHeadingRecord: Sendable, Equatable {
  let request: RichRuntimeItemHeadingRequest
  let heading: RichRuntimeItemHeading

  @MainActor func displayHeading(for item: RichRuntimeItem, projection: RichRuntimeItemHeadingProjection?) -> RichRuntimeItemHeading? {
    guard heading.workflowMetadata == nil, heading.workflowView == nil,
      request == RichRuntimeItemHeadingRequest(item, projection: projection) else { return nil }
    return heading
  }
}
