import Foundation
import Observation
import SwiftUI

/// Presentation of existing host timing, matching the PWA selectors. Runtime
/// items have no send timestamp: a sole root prompt gets the completed turn's
/// start. Ambiguous steers, nested prompts and unfinished turns are not dated.
enum RichChatTurnTiming {
  static func userMessageStarts(items: [RichRuntimeItem], turns: [RichCompletedTurn]) -> [String: Int64] {
    let byAnchor = Dictionary(turns.compactMap { turn in turn.anchorItemID.map { ($0, turn) } },
      uniquingKeysWith: { _, last in last })
    var pending: [String] = []
    var result: [String: Int64] = [:]
    for item in items {
      if item.type == RichItemType.userMessage, item.parentItemID == nil {
        pending.append(item.id)
        continue
      }
      guard let turn = byAnchor[item.id], !pending.isEmpty else { continue }
      if pending.count == 1 { result[pending[0]] = turn.startedAtMilliseconds }
      pending = []
    }
    return result
  }

  static func messageTimestamp(_ milliseconds: Int64, now: Date = .now,
    locale: Locale = .autoupdatingCurrent, calendar sourceCalendar: Calendar = .autoupdatingCurrent
  ) -> String {
    let date = Date(timeIntervalSince1970: Double(milliseconds) / 1_000)
    let today = sourceCalendar.startOfDay(for: now)
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = sourceCalendar.timeZone
    if date >= today {
      formatter.setLocalizedDateFormatFromTemplate("jm")
    } else {
      let weekday = sourceCalendar.component(.weekday, from: today)
      let daysSinceMonday = (weekday + 5) % 7
      let monday = sourceCalendar.date(byAdding: .day, value: -daysSinceMonday, to: today) ?? today
      if date >= monday { formatter.setLocalizedDateFormatFromTemplate("EEEjm") }
      else { formatter.dateStyle = .short; formatter.timeStyle = .short }
    }
    return formatter.string(from: date)
  }

  static func liveStart(thread: RemoteThread?, foregroundIsOpen: Bool?, hasBackgroundWork: Bool) -> Int64? {
    guard let thread else { return nil }
    guard !["error", "inactive"].contains(thread.status) else { return nil }
    let active = ["launching", "working", "needs_approval", "needs_reply"].contains(thread.status)
      || foregroundIsOpen == true
      || hasBackgroundWork
    guard active else { return nil }
    return RichTimeline.epochMilliseconds(thread.activeTurnStartedAt ?? thread.lastTurnStartedAt ?? thread.createdAt)
  }

  static func completedLabel(for entry: RichTimelineEntry, turns: [RichCompletedTurn]) -> String? {
    for item in entry.runtimeItems {
      if let turn = turns.first(where: { $0.anchorItemID == item.id }) {
        return RichChatPresentation.completedTurnDuration(turn.durationMilliseconds).map(RichChatMessageActionStrings.workedFor)
      }
    }
    return nil
  }

  static func tailCompletedLabel(entries: [RichTimelineEntry], turns: [RichCompletedTurn], isLive: Bool,
    fallback: RichCompletedTurn? = nil) -> String? {
    guard !isLive, let last = turns.last(where: \.isDisplayable) ?? fallback, last.anchorItemID == nil else { return nil }
    if let entry = entries.last, completedLabel(for: entry, turns: turns) != nil { return nil }
    return RichChatPresentation.completedTurnDuration(last.durationMilliseconds).map(RichChatMessageActionStrings.workedFor)
  }

  static func completedFallback(thread: RemoteThread?) -> RichCompletedTurn? {
    guard let thread, let start = thread.lastTurnStartedAt.flatMap(RichTimeline.epochMilliseconds),
      let end = thread.lastTurnEndedAt.flatMap(RichTimeline.epochMilliseconds) else { return nil }
    return .init(startedAtMilliseconds: start, endedAtMilliseconds: max(start, end), anchorItemID: nil)
  }
}

/// Window/thread-owned display clock. A layout replacement keeps pauses; a new
/// host turn resets them. Only the leaf TimelineView ticks each second.
@MainActor @Observable
final class RichChatLiveTurnClock {
  private(set) var startedAt: Int64?
  private(set) var pausedAt: Date?
  private(set) var pausedSeconds: TimeInterval = 0

  func synchronize(startedAt: Int64?, paused: Bool, now: Date = .now) {
    if self.startedAt != startedAt {
      self.startedAt = startedAt
      pausedAt = nil
      pausedSeconds = 0
    }
    guard startedAt != nil else { return }
    if paused { if pausedAt == nil { pausedAt = now } }
    else if let pausedAt {
      pausedSeconds += max(0, now.timeIntervalSince(pausedAt))
      self.pausedAt = nil
    }
  }

  func elapsed(at now: Date) -> TimeInterval? {
    guard let startedAt else { return nil }
    return max(0, (pausedAt ?? now).timeIntervalSince1970 - Double(startedAt) / 1_000 - pausedSeconds)
  }
}

struct RichChatLiveTurnIndicator: View {
  let startedAt: Int64
  let paused: Bool
  let clock: RichChatLiveTurnClock
  var sharesSurface = false

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let elapsed = clock.elapsed(at: context.date) ?? max(0, context.date.timeIntervalSince1970 - Double(startedAt) / 1_000)
      indicator(elapsed: elapsed, now: context.date)
    }
    .fixedSize()
    .onAppear { clock.synchronize(startedAt: startedAt, paused: paused) }
    .onChange(of: startedAt) { clock.synchronize(startedAt: startedAt, paused: paused) }
    .onChange(of: paused) { clock.synchronize(startedAt: startedAt, paused: paused) }
  }

  @ViewBuilder private func indicator(elapsed: TimeInterval, now: Date) -> some View {
    if sharesSurface { label(elapsed: elapsed, now: now).frame(minHeight: 44) }
    else {
      label(elapsed: elapsed, now: now)
        .poracodeGlassBackground(in: Capsule())
        .frame(minHeight: 44)
    }
  }

  private func label(elapsed: TimeInterval, now: Date) -> some View {
    HStack(spacing: 5) {
      Image(systemName: paused ? "pause.circle" : "clock")
      Text(RichBackgroundTaskElapsed.compactText(
        startedAtMilliseconds: (now.timeIntervalSince1970 - elapsed) * 1_000, now: now))
        .monospacedDigit()
    }
    .font(.caption2.weight(.medium))
    .foregroundStyle(.secondary)
    .fixedSize(horizontal: true, vertical: false)
    .padding(.horizontal, 10)
    .frame(minHeight: 28)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(RichChatStrings.working)
    .accessibilityValue(RichBackgroundTaskElapsed.compactText(
      startedAtMilliseconds: (now.timeIntervalSince1970 - elapsed) * 1_000, now: now))
    .accessibilityIdentifier("native-e2e.turn-elapsed")
  }
}

struct RichChatMessageTimestamp: View {
  let milliseconds: Int64
  let identifier: String

  var body: some View {
    let date = Date(timeIntervalSince1970: Double(milliseconds) / 1_000)
    Text(RichChatTurnTiming.messageTimestamp(milliseconds))
      .poracodeChatText(.metadata)
      .monospacedDigit()
      .foregroundStyle(.secondary)
      .fixedSize()
      .accessibilityLabel(date.formatted(date: .complete, time: .standard))
      .accessibilityIdentifier(identifier)
  }
}
