import Foundation

enum RichChatStrings {
  static func value(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(key, tableName: nil, bundle: .main, value: fallback, comment: "")
  }

  private static func messageActionValue(_ key: String, _ fallback: String) -> String {
    Bundle.main.localizedString(forKey: key, value: fallback, table: "RichChatMessageActions")
  }

  static let refreshTranscript = value("rich_chat_refresh_transcript", "Refresh transcript")
  static let refreshRequired = value(
    "rich_chat_refresh_required",
    "The last change may have reached the desktop. Refresh before trying it again."
  )
  static let readOnly = value("rich_chat_read_only", "This session is read-only.")
  static let noSession = value("rich_chat_no_session", "No desktop session is selected.")
  static let offline = value(
    "rich_chat_offline", "Rich chat is unavailable while the desktop is offline."
  )
  static let notReady = value(
    "rich_chat_session_not_ready", "Wait for the desktop session to finish loading."
  )
  static let noThread = value("rich_chat_no_thread", "No conversation is selected.")
  static let backgrounded = value(
    "rich_chat_backgrounded", "Return to Poracode to continue this action."
  )
  static let authRequired = value(
    "rich_chat_auth_required", "Pair with the desktop again to continue."
  )
  static let permissionDenied = value(
    "rich_chat_permission_denied", "This session does not have permission for that action."
  )
  static let invalidRequest = value(
    "rich_chat_invalid_request", "The request is incomplete or invalid."
  )
  static let invalidResponse = value(
    "rich_chat_invalid_response", "The desktop returned an invalid rich-chat response."
  )
  static let requestFailed = value(
    "rich_chat_request_failed", "The desktop could not complete the request."
  )
  static let requestUncertain = value(
    "rich_chat_request_uncertain",
    "The connection ended before the desktop confirmed the change. Refresh before trying again."
  )
  static let terminalTitle = value("rich_chat_terminal_deferred_title", "Terminal conversation")
  static let terminalDeferred = value(
    "rich_chat_terminal_deferred_message",
    "Interactive terminal streaming is not available in this native build yet. Open this conversation on the desktop."
  )

  static let timeline = value("rich_chat_timeline_description", "Rich conversation timeline")
  static let scrollToBottom = value("rich_chat_scroll_to_bottom", "Scroll to Bottom")
  static let expandActivity = value("rich_chat_expand_activity", "Expand activity")
  static let collapseActivity = value("rich_chat_collapse_activity", "Collapse activity")
  static let working = value("rich_chat_working", "Working…")
  static let loadingOlder = value("rich_chat_loading_older", "Loading older messages…")
  static let you = value("rich_chat_you", "You")
  static let assistant = value("rich_chat_assistant", "Assistant")
  static let reasoning = value("rich_chat_reasoning", "Reasoning")
  static let thought = value("rich_chat_thought", "Thought")
  static let command = value("rich_chat_command", "Command")
  static let fileChanges = value("rich_chat_file_changes", "File changes")
  static let webSearch = value("rich_chat_web_search", "Web search")
  static let image = value("rich_chat_image", "Image")
  static let activity = value("rich_chat_activity", "Activity")
  static let tool = value("rich_chat_tool", "Tool")
  static let conversationImage = value("rich_chat_image_description", "Conversation image")
  static let imageUnavailable = value(
    "rich_chat_image_unavailable", "This image could not be displayed safely."
  )

  static let addAttachment = value("rich_chat_add_attachment", "Add attachment")
  static let composerControls = value("rich_chat_composer_controls", "Composer controls")
  static let thinking = value("rich_chat_thinking", "Thinking")
  static let invalidAttachment = value(
    "rich_chat_attachment_invalid", "Choose a non-empty file no larger than 20 MiB."
  )
  static let uploadFailed = value(
    "rich_chat_attachment_upload_failed",
    "The attachment could not be uploaded. Your message was kept."
  )
  static let requests = value("rich_chat_requests_title", "Agent request")
  static let allow = value("rich_chat_allow", "Allow")
  static let deny = value("rich_chat_deny", "Deny")
  static let showDetails = value("rich_chat_show_details", "Show details")
  static let hideDetails = value("rich_chat_hide_details", "Hide details")

  static let goal = value("rich_chat_goal", "Goal")
  static let editGoal = value("rich_chat_edit_goal", "Edit goal")
  static let goalObjective = value("rich_chat_goal_objective", "Goal objective")
  static let pauseGoal = value("rich_chat_pause_goal", "Pause goal")
  static let resumeGoal = value("rich_chat_resume_goal", "Resume goal")
  static let clearGoal = value("rich_chat_clear_goal", "Clear goal")
  static let save = value("rich_chat_save", "Save")
  static let pendingSteer = value("rich_chat_pending_steer", "Pending steer")
  static let plan = messageActionValue("rich.plan", "Plan")
  static let errors = messageActionValue("rich.errors", "Errors")
  static func activityCount(_ count: Int) -> String {
    let format = value("rich_chat_activity_group", "%lld activity items")
    return String(format: format, locale: .current, Int64(count))
  }
  static let noPendingSteer = value(
    "rich_chat_no_pending_steer", "No follow-up instruction is staged."
  )
  static let addSteer = value("rich_chat_add_steer", "Add steer")
  static let editSteer = value("rich_chat_edit_steer", "Edit steer")
  static let clearSteer = value("rich_chat_clear_steer", "Clear steer")
  static let steerMessage = value("rich_chat_steer_message", "Follow-up instruction")

  static let contextWindow = value("rich_chat_context_window", "Context window")
  static let contextUsageUnknown = value(
    "rich_chat_context_unknown", "Occupancy not reported"
  )
  private static let contextPercentFormat = value("rich_chat_context_percent", "%@ used")
  private static let contextTokensFormat = value(
    "rich_chat_context_tokens", "%1$@ of %2$@ tokens"
  )

  static func contextPercent(_ percent: Int) -> String {
    String(format: contextPercentFormat, percent.formatted(.percent))
  }

  static func contextTokens(used: Int64, maxTokens: Int64) -> String {
    String(
      format: contextTokensFormat,
      used.formatted(.number),
      maxTokens.formatted(.number)
    )
  }

  static let checkpoints = value("rich_chat_checkpoints", "Checkpoints")
  static let refreshCheckpoints = value(
    "rich_chat_refresh_checkpoints", "Refresh checkpoints"
  )
  static let loadingCheckpoints = value(
    "rich_chat_loading_checkpoints", "Loading checkpoints…"
  )
  static let noCheckpoints = value(
    "rich_chat_no_checkpoints", "No file checkpoints are available."
  )
  static let turnCheckpoint = value("rich_chat_turn_checkpoint", "Turn checkpoint")
  static let fileCheckpoint = value("rich_chat_file_checkpoint", "File checkpoint")
  static let restoreFiles = value("rich_chat_restore_files", "Restore files")
  static let rollbackOneTurn = value("rich_chat_rollback_one_turn", "Roll back one turn")
  static let restoreTitle = value(
    "rich_chat_restore_checkpoint_title", "Restore checkpoint files?"
  )
  static let restoreMessage = value(
    "rich_chat_restore_checkpoint_message",
    "Files in the project will be restored to this checkpoint. Later conversation messages are not removed."
  )
  static let rollbackTitle = value("rich_chat_rollback_title", "Roll back one turn?")
  static let rollbackMessage = value(
    "rich_chat_rollback_message",
    "The provider conversation will move back one completed turn. Refresh before continuing."
  )
  static let rollback = value("rich_chat_rollback", "Roll back")

  static let loadingTranscript = value("rich_chat_loading_transcript", "Loading transcript…")
  static let emptyTranscript = value("rich_chat_empty_transcript_title", "No messages yet")
  static let emptyTranscriptMessage = value(
    "rich_chat_empty_transcript_message", "Send a message to start this conversation."
  )
  static let loadOlder = value("rich_chat_load_older", "Load earlier messages")
  static let message = value("rich_chat_message_placeholder", "Message")
  static let send = value("rich_chat_send_message", "Send message")
  static let stop = value("rich_chat_stop_generation", "Stop generation")
  static let retry = value("rich_chat_retry", "Try Again")
  static let cancel = value("rich_chat_cancel", "Cancel")

  static let truncateAction = value("rich_chat_truncate_action", "Delete From Here")
  static let truncateAccessibilityLabel = value(
    "rich_chat_truncate_accessibility",
    "Delete every item after this one"
  )
  static let truncateConfirmationTitle = value(
    "rich_chat_truncate_confirm_title",
    "Delete everything after this item?"
  )
  static let truncateConfirmationMessage = value(
    "rich_chat_truncate_confirm_message",
    "The desktop removes every later item from this thread's runtime. This cannot be undone."
  )
  static let truncateConfirm = value("rich_chat_truncate_confirm_button", "Delete")

  static let closeThread = value("rich_chat_close_thread", "Close Thread")
  static let continueInProvider = value(
    "rich_chat_continue_in_provider", "Continue in another provider"
  )
  static let handoffFork = value("rich_chat_handoff_fork", "Fork Conversation")
  static let handoffPrompt = value(
    "rich_chat_handoff_prompt", "Tell the new provider what to do next…"
  )
  static let closeThreadConfirmationTitle = value(
    "rich_chat_close_thread_confirm_title",
    "Close this thread?"
  )
  static let closeThreadConfirmationMessage = value(
    "rich_chat_close_thread_confirm_message",
    "The desktop stops this thread's runtime. The transcript stays available."
  )
  static let removeAttachment = value("rich_chat_remove_attachment_action", "Remove attachment")
  static let removeFile = value("rich_chat_remove_file_action", "Remove file")
  static let removeReviewComment = value(
    "rich_chat_remove_review_comment_action", "Remove review comment"
  )
  static let removeSkill = value("rich_chat_remove_skill_action", "Remove skill")
  static let goalStatusActive = value("rich_chat_goal_status_active", "Active")
  static let goalStatusPaused = value("rich_chat_goal_status_paused", "Paused")
  static let goalStatusBudgetLimited = value(
    "rich_chat_goal_status_budget_limited", "Budget limit reached"
  )
  static let goalStatusComplete = value("rich_chat_goal_status_complete", "Complete")
  static let goalStatusFailed = value("rich_chat_goal_status_failed", "Failed")
  static let goalStatusCancelled = value("rich_chat_goal_status_cancelled", "Cancelled")

  static func goalStatus(_ status: String) -> String {
    switch status {
    case "active": goalStatusActive
    case "paused": goalStatusPaused
    case "budget_limited", "budget-limited": goalStatusBudgetLimited
    case "complete", "completed": goalStatusComplete
    case "failed": goalStatusFailed
    case "cancelled", "canceled": goalStatusCancelled
    default: status
    }
  }

  static func failure(_ failure: RichChatControllerFailure) -> String {
    switch failure {
    case .unavailable: noSession
    case .offline: offline
    case .notReady: notReady
    case .busy: value("rich_chat_busy", "Another conversation action is running.")
    case .capabilityMissing, .authorizationMissingScope, .authorizationDenied: permissionDenied
    case .authenticationExpired: authRequired
    case .invalidRequest: invalidRequest
    case .invalidResponse: invalidResponse
    case .rawTransportUnavailable:
      value(
        "rich_chat_raw_transport_unavailable", "This media transfer is not available."
      )
    case .ambiguousOutcome: requestUncertain
    case .rejected, .transport: requestFailed
    }
  }
}
