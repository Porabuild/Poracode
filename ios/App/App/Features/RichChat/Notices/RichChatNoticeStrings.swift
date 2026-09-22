import Foundation

/// Localized copy for the B1 durable history notice. Every key is translated in
/// all supported `Localizable.xcstrings` catalogs; counts are rendered as
/// truthful cumulative lower bounds ("at least"), never exact loss totals.
enum RichChatNoticeStrings {
  private static func value(_ key: String, _ fallback: String) -> String {
    NSLocalizedString(key, tableName: nil, bundle: .main, value: fallback, comment: "")
  }

  static let title = value(
    "rich_chat_notice_title", "Some history is missing"
  )
  static let explainer = value(
    "rich_chat_notice_explainer",
    "This conversation can continue, but the missing content is gone and cannot be restored."
  )
  static let acknowledge = value(
    "rich_chat_notice_acknowledge", "Acknowledge and continue"
  )
  static let acknowledging = value(
    "rich_chat_notice_acknowledging", "Acknowledging…"
  )
  static let retry = value("rich_chat_notice_retry", "Try again")
  static let uncertain = value(
    "rich_chat_notice_uncertain",
    "The desktop did not confirm the acknowledgement. Try again to finish it."
  )
  static let descriptorFailure = value(
    "rich_chat_notice_read_failed",
    "The desktop could not read the missing-history details. Try again."
  )
  static let episodeTitle = value(
    "rich_chat_notice_episode_title", "History is incomplete"
  )
  static let episodeExplainer = value(
    "rich_chat_notice_episode_explainer",
    "Acknowledge this gap to keep reading an incomplete conversation. Missing content is not restored."
  )
  static let lowerBoundEvents = value(
    "rich_chat_notice_lower_bound_events", "Events not saved: at least %lld"
  )
  static let lowerBoundBytes = value(
    "rich_chat_notice_lower_bound_bytes", "Data not saved: at least %@"
  )
  static let evidenceExact = value(
    "rich_chat_notice_evidence_exact", "Recorded gap"
  )
  static let evidenceSuspect = value(
    "rich_chat_notice_evidence_suspect", "Unverified interruption"
  )

  static func lowerBound(events: Int, bytes: Int) -> String {
    let eventsText = String(format: lowerBoundEvents, locale: Locale.current, Int64(events))
    let bytesText = String(
      format: lowerBoundBytes,
      locale: Locale.current,
      ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .binary)
    )
    return "\(eventsText) · \(bytesText)"
  }

  static func evidence(_ source: String) -> String {
    switch source {
    case "suspect": return evidenceSuspect
    default: return evidenceExact
    }
  }

  static func reason(_ reason: String) -> String {
    let normalized = reason.replacingOccurrences(of: "-", with: "_")
    let fallback = fallbackReasons[normalized] ?? "The conversation history is incomplete."
    return NSLocalizedString(
      "rich_chat_notice_reason_\(normalized)",
      tableName: nil,
      bundle: .main,
      value: fallback,
      comment: "Localized reason why runtime history is incomplete"
    )
  }

  /// One resolved banner state. Keeping the branch selection out of the view
  /// makes the presentation rules testable without a render harness.
  struct Presentation: Equatable {
    enum Action: Equatable {
      case none
      case acknowledge
      case retryAcknowledgement
      case retryDescriptor
    }

    var title: String
    var message: String
    var action: Action
    var isBusy: Bool
    var failureText: String?
  }

  static func durablePresentation(_ notice: RemoteHistoryNotice) -> Presentation {
    Presentation(
      title: title,
      message: [
        reason(notice.reason),
        lowerBound(events: notice.refusedEvents, bytes: notice.refusedBytes),
        evidence(notice.source),
        explainer,
      ].joined(separator: "\n"),
      action: .none,
      isBusy: false,
      failureText: nil
    )
  }

  static func episodePresentation(_ episode: RemoteHistoryGapDescriptor) -> Presentation {
    Presentation(
      title: episodeTitle,
      message: [
        reason(episode.reason),
        lowerBound(events: episode.refusedEvents, bytes: episode.refusedBytes),
        evidence(episode.source),
        episodeExplainer,
      ].joined(separator: "\n"),
      action: .acknowledge,
      isBusy: false,
      failureText: nil
    )
  }

  /// Source-locale fallbacks; every value is translated in the shipped catalogs.
  private static let fallbackReasons: [String: String] = [
    "thread_events": "The desktop dropped events for this conversation while it was overloaded.",
    "thread_bytes": "The desktop dropped data for this conversation while it was overloaded.",
    "global_events": "The desktop dropped events across all conversations while it was overloaded.",
    "global_bytes": "The desktop dropped data across all conversations while it was overloaded.",
    "oversize": "An event was too large to store.",
    "age": "Old events were removed before they could be stored.",
    "degraded": "History storage was degraded and could not accept every event.",
    "rebase_dropped": "A history rebase replaced content that had not been stored.",
    "shutdown": "The desktop shut down before every event was stored.",
    "unclean_epoch": "A previous desktop session ended unexpectedly before every event was stored.",
  ]
}
