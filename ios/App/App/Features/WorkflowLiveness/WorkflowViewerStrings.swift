import Foundation

enum WorkflowViewerStrings {
  private static func text(_ key: StaticString, _ value: String.LocalizationValue) -> String {
    String(localized: key, defaultValue: value, table: "WorkflowLiveness")
  }
  private static func format(_ key: StaticString, _ value: String.LocalizationValue, _ args: CVarArg...) -> String {
    String(format: text(key, value), locale: .current, arguments: args)
  }
  static var title: String { text("workflow.viewer.title", "Workflow") }
  static var open: String { text("workflow.viewer.open", "Open workflow") }
  static var close: String { text("workflow.viewer.close", "Close") }
  static var phases: String { text("workflow.viewer.phases", "Phase") }
  static var unphased: String { text("workflow.viewer.unphased", "Other agents") }
  static var selectAgent: String { text("workflow.viewer.select", "Select an agent to see its conversation") }
  static var waiting: String { text("workflow.viewer.waiting", "Waiting for workflow agents") }
  static var readFailed: String { text("workflow.viewer.readFailed", "Couldn’t load the workflow. Try again.") }
  static var chatFailed: String { text("workflow.viewer.chatFailed", "Couldn’t refresh this conversation.") }
  static var prompt: String { text("workflow.viewer.prompt", "Prompt") }
  static var outcome: String { text("workflow.viewer.outcome", "Outcome") }
  static func agents(_ completed: String, _ total: String) -> String { format("workflow.viewer.agents", "%@/%@ agents", completed, total) }
  static func tokens(_ count: String) -> String { format("workflow.viewer.tokens", "%@ tokens", count) }
  static func tools(_ count: String) -> String { format("workflow.viewer.tools", "%@ tools", count) }
  static func lastTool(_ name: String) -> String { format("workflow.viewer.lastTool", "Last tool: %@", name) }
  static func state(_ state: AdvancedWorkflowAgentState?) -> String {
    switch state {
    case .done: text("workflow.viewer.done", "Done")
    case .failed: text("workflow.viewer.failed", "Failed")
    case .cancelled: text("workflow.viewer.cancelled", "Cancelled")
    case .queued: text("workflow.viewer.queued", "Queued")
    case .running, .none: text("workflow.viewer.running", "Running")
    }
  }
  static func role(_ role: AdvancedWorkflowChatRole) -> String {
    switch role {
    case .user: text("workflow.viewer.user", "User")
    case .assistant: text("workflow.viewer.assistant", "Assistant")
    case .tool: text("workflow.viewer.tool", "Tool")
    }
  }
}
