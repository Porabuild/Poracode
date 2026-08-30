import Foundation

enum SettingsUsageTone: Equatable {
  case normal
  case warning
  case danger
  case unknown
}

struct SettingsUsageProjection: Equatable {
  let projectedPercent: Double
  let lastsToReset: Bool
  let runsOutAt: Date?
}

struct SettingsUsagePace: Equatable {
  let text: String
  let tone: SettingsUsageTone
}

enum SettingsUsagePresentation {
  static func providerLabel(_ providerID: String) -> String {
    switch providerID.lowercased() {
    case "antigravity": "Antigravity"
    case "claude": "Claude"
    case "codex": "Codex"
    case "commandcode": "Command Code"
    case "copilot": "GitHub Copilot"
    case "factory": "Droid"
    case "gemini": "Gemini"
    case "grok": "Grok"
    case "qwen": "Qwen"
    case "opencode": "OpenCode"
    case "cursor": "Cursor"
    case "kimi": "Kimi"
    case "zai": "z.ai"
    default: ProfilePresentation.providerLabel(providerID)
    }
  }

  static func ordered(
    _ snapshots: [SettingsUsageSnapshot],
    providerOrder: [String]
  ) -> [SettingsUsageSnapshot] {
    let ranks = Dictionary(uniqueKeysWithValues: providerOrder.enumerated().map { ($1, $0) })
    let original = Dictionary(
      uniqueKeysWithValues: snapshots.enumerated().map { ($1.providerId, $0) }
    )
    return snapshots.sorted { left, right in
      let leftRank = ranks[left.providerId]
      let rightRank = ranks[right.providerId]
      switch (leftRank, rightRank) {
      case (.some(let left), .some(let right)): return left < right
      case (.some, .none): return true
      case (.none, .some): return false
      case (.none, .none):
        return original[left.providerId, default: 0] < original[right.providerId, default: 0]
      }
    }
  }

  static func metaLine(
    _ snapshot: SettingsUsageSnapshot,
    showsEstimatedCost: Bool
  ) -> String? {
    guard (showsEstimatedCost && snapshot.cost != nil) || snapshot.tokens?.total != nil else {
      return nil
    }
    let cost =
      showsEstimatedCost
      ? snapshot.cost.map { "~\(quantity($0.amount, suffix: $0.currency))" } ?? ""
      : ""
    let tokens = snapshot.tokens?.total.map { $0.formatted() } ?? ""
    let period = showsEstimatedCost ? snapshot.cost.map(periodLabel) ?? "" : ""
    return [cost, tokens.isEmpty ? "" : SettingsUIStrings.tokenCount(tokens), period]
      .filter { !$0.isEmpty }
      .joined(separator: " · ")
  }

  private static func periodLabel(_ cost: SettingsUsageCost) -> String {
    switch cost.period {
    case .today: SettingsUIStrings.periodToday
    case .sevenDays: SettingsUIStrings.periodSevenDays
    case .thirtyDays: SettingsUIStrings.periodThirtyDays
    case .cycle: SettingsUIStrings.periodCycle
    }
  }

  static func quantity(_ value: Double, suffix: String?) -> String {
    [value.formatted(), suffix].compactMap { $0 }.joined(separator: " ")
  }

  static func tone(for usedPercent: Double?) -> SettingsUsageTone {
    guard let usedPercent, usedPercent.isFinite else { return .unknown }
    if usedPercent >= 90 { return .danger }
    if usedPercent >= 70 { return .warning }
    return .normal
  }

  static func windowValue(_ window: SettingsUsageWindow) -> String {
    let percent = "\(Int(window.usedPercent.rounded()))%"
    guard window.unit == .requests, let used = window.used else { return percent }
    let requests: String
    if let limit = window.limit {
      requests = "\(wholeNumber(used)) / \(wholeNumber(limit))"
    } else {
      requests = wholeNumber(used)
    }
    return "\(percent) · \(requests)"
  }

  static func windowSecondaryValue(_ window: SettingsUsageWindow) -> String? {
    guard let used = window.used, window.unit == .usd || window.currency != nil else { return nil }
    let value = money(used, currency: window.currency)
    guard let limit = window.limit else { return value }
    return "\(value) / \(money(limit, currency: window.currency))"
  }

  static func resetCountdown(_ resetsAt: Int64?, now: Date) -> String? {
    guard let resetsAt else { return nil }
    let deltaMilliseconds = Double(resetsAt) - now.timeIntervalSince1970 * 1_000
    if deltaMilliseconds <= 0 { return "now" }
    let totalMinutes = Int(deltaMilliseconds / 60_000)
    let days = totalMinutes / 1_440
    let hours = (totalMinutes % 1_440) / 60
    let minutes = totalMinutes % 60
    if days > 0 { return "\(days)d \(hours)h" }
    if hours > 0 { return "\(hours)h \(minutes)m" }
    return "\(minutes)m"
  }

  static func projection(
    for window: SettingsUsageWindow,
    now: Date
  ) -> SettingsUsageProjection? {
    guard window.unit != .usd, let resetsAt = window.resetsAt else { return nil }
    let resetDate = Date(timeIntervalSince1970: Double(resetsAt) / 1_000)
    guard let duration = windowDuration(for: window.id, resetsAt: resetDate), duration > 0 else {
      return nil
    }
    let elapsed = now.timeIntervalSince(resetDate.addingTimeInterval(-duration)) / duration
    guard elapsed.isFinite, elapsed >= 0.05, elapsed < 1 else { return nil }
    let used = min(max(window.usedPercent, 0), 100)
    guard used >= 1 else { return nil }
    let projected = used / elapsed
    let lastsToReset = projected <= 100
    let runsOutAt =
      lastsToReset
      ? nil
      : resetDate.addingTimeInterval(-duration + (100 / used) * elapsed * duration)
    return SettingsUsageProjection(
      projectedPercent: projected,
      lastsToReset: lastsToReset,
      runsOutAt: runsOutAt
    )
  }

  static func pace(for window: SettingsUsageWindow, now: Date) -> SettingsUsagePace? {
    guard let projection = projection(for: window, now: now), let resetsAt = window.resetsAt else {
      return nil
    }
    let tone = tone(for: projection.projectedPercent)
    if projection.lastsToReset {
      return SettingsUsagePace(
        text: SettingsUIStrings.projectedByReset(Int(projection.projectedPercent.rounded())),
        tone: tone
      )
    }
    guard let runsOutAt = projection.runsOutAt else {
      return SettingsUsagePace(text: SettingsUIStrings.overPace, tone: tone)
    }
    if runsOutAt <= now {
      let reset = resetCountdown(resetsAt, now: now)
      return SettingsUsagePace(
        text: reset.map(SettingsUIStrings.ranOutResetsIn) ?? SettingsUIStrings.ranOut,
        tone: tone
      )
    }
    let runOut = resetCountdown(Int64(runsOutAt.timeIntervalSince1970 * 1_000), now: now)
    return SettingsUsagePace(
      text: runOut.map(SettingsUIStrings.runsOutIn) ?? SettingsUIStrings.runsOutEarly,
      tone: tone
    )
  }

  static func statusLabel(_ status: SettingsUsageStatus) -> String {
    switch status {
    case .ok: SettingsUIStrings.statusOK
    case .authMissing: SettingsUIStrings.statusAuthMissing
    case .appNotRunning: SettingsUIStrings.statusAppNotRunning
    case .rateLimited: SettingsUIStrings.statusRateLimited
    case .quotaHit: SettingsUIStrings.statusQuotaHit
    case .unsupported: SettingsUIStrings.statusUnsupported
    case .error: SettingsUIStrings.statusError
    }
  }

  private static func wholeNumber(_ value: Double) -> String {
    Int64(value.rounded()).formatted()
  }

  private static func money(_ value: Double, currency: String?) -> String {
    value.formatted(
      .currency(code: currency ?? "USD")
        .precision(.fractionLength(2))
    )
  }

  private static func windowDuration(for id: String, resetsAt: Date) -> TimeInterval? {
    let hour: TimeInterval = 3_600
    let day: TimeInterval = 86_400
    switch id {
    case "session-5h": return 5 * hour
    case "weekly", "weekly-opus", "weekly-sonnet", "weekly-fable": return 7 * day
    case "monthly", "cursor-auto", "cursor-api", "factory:premium":
      guard let start = Calendar.current.date(byAdding: .month, value: -1, to: resetsAt) else {
        return nil
      }
      return resetsAt.timeIntervalSince(start)
    default:
      if id.hasPrefix("gemini:") { return day }
      switch id.split(separator: ":").last {
      case "session-5h": return 5 * hour
      case "weekly": return 7 * day
      case "monthly":
        guard let start = Calendar.current.date(byAdding: .month, value: -1, to: resetsAt) else {
          return nil
        }
        return resetsAt.timeIntervalSince(start)
      default: return nil
      }
    }
  }
}

enum SettingsUsageRelative {
  static func format(_ date: Date) -> String {
    let seconds = max(0, date.timeIntervalSinceNow * -1)
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits =
      seconds < 60
      ? [.second]
      : seconds < 3_600
        ? [.minute]
        : seconds < 86_400
          ? [.hour]
          : [.day]
    formatter.maximumUnitCount = 1
    formatter.unitsStyle = .abbreviated
    return formatter.string(from: seconds) ?? ""
  }
}
