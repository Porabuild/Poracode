import Foundation

enum HomeNewsInsightFact: Equatable, Sendable {
  case streak(current: Int64, longest: Int64)
  case weekPrompts(prompts: Int64, daily: [Int64], busiestDay: String?)
  case topModel(label: String, percent: Double)
  case activeHour(Int64)
  case longestTask(minutes: Int64)

  var id: String {
    switch self {
    case .streak: "insight:streak"
    case .weekPrompts: "insight:week-prompts"
    case .topModel: "insight:top-model"
    case .activeHour: "insight:active-hour"
    case .longestTask: "insight:longest-task"
    }
  }
}

enum HomeNewsFacts {
  /// Facts come from the selected host's all-time device profile, as in the PWA.
  static func insights(_ stats: SettingsProfileCoreStats?) -> [HomeNewsInsightFact] {
    guard let stats else { return [] }
    var facts: [HomeNewsInsightFact] = []
    let totals = stats.totals
    if totals.currentStreakDays >= 2 {
      facts.append(.streak(current: totals.currentStreakDays, longest: max(totals.currentStreakDays, totals.longestStreakDays)))
    }
    let week = stats.promptHeatmap.metric == .prompts ? Array(stats.promptHeatmap.cells.suffix(7)) : []
    let prompts = week.reduce(Int64(0)) { $0 + $1.count }
    if prompts >= 5 {
      var busiest: SettingsProfileHeatmapCell?
      for day in week where busiest == nil || day.count > busiest!.count { busiest = day }
      facts.append(.weekPrompts(prompts: prompts, daily: week.map(\.count), busiestDay: busiest.flatMap { $0.count > 0 ? $0.day : nil }))
    }
    if let model = stats.insights.topModel, totals.totalPrompts >= 20, model.percent >= 25 {
      facts.append(.topModel(label: model.label, percent: model.percent.rounded()))
    }
    if let hour = stats.insights.mostActiveHour, totals.totalPrompts >= 10 {
      facts.append(.activeHour(hour.hour))
    }
    let minutes = Int64((Double(totals.longestTaskMs) / 60_000).rounded())
    if minutes >= 10 { facts.append(.longestTask(minutes: minutes)) }
    return facts
  }

  static func usage(_ snapshots: [SettingsUsageSnapshot], disabledProviders: Set<String>, labelFor: (String) -> String?) -> HomeNewsUsageFact? {
    var best: HomeNewsUsageFact?
    for snapshot in snapshots where snapshot.status == .ok && !disabledProviders.contains(snapshot.providerId) {
      guard let label = labelFor(snapshot.providerId) else { continue }
      for window in snapshot.windows where window.usedPercent >= 50 {
        if let best, window.usedPercent <= best.window.usedPercent { continue }
        best = HomeNewsUsageFact(providerID: snapshot.providerId, providerLabel: label, window: window)
      }
    }
    return best
  }
}

struct HomeNewsUsageFact: Equatable, Sendable {
  let providerID: String
  let providerLabel: String
  let window: SettingsUsageWindow
  var id: String { "usage:\(providerID):\(window.id)" }
  var urgent: Bool { window.usedPercent >= 80 }
}
