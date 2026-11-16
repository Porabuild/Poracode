import SwiftUI

/// The sections below the profile heatmap. Their order and metric-switching rules
/// intentionally follow the PWA `ProfileSettings` composition.
struct SettingsProfileDetails: View {
  let information: SettingsProfileInformation
  let metric: SettingsProfileHeatmapMetric
  let window: SettingsProfileWindow
  let selectedAccount: String?

  var body: some View {
    VStack(spacing: 28) {
      if let recent = information.core.recent {
        recentTrendsSection(recent)
      }
      activityInsights
      ProfileUsageSection(
        title: SettingsUIStrings.skillsHeader,
        emptyText: SettingsUIStrings.noSkillsUsed,
        items: information.core.skills
      )
      ProfileUsageSection(
        title: SettingsUIStrings.mcpServers,
        emptyText: SettingsUIStrings.noMCPToolsUsed,
        items: information.core.mcps
      )
      ProfileBreakdownSection(
        title: SettingsUIStrings.providers,
        caption: providersByTokens
          ? SettingsUIStrings.byTokens : SettingsUIStrings.byPrompts,
        entries: providerEntries,
        compactValues: providersByTokens,
        emptyText: SettingsUIStrings.noActivityYet
      )
      if !modelEntries.isEmpty {
        ProfileBreakdownSection(
          title: SettingsUIStrings.modelUsage,
          caption: modelsByTokens
            ? SettingsUIStrings.byTokens : SettingsUIStrings.byPrompts,
          entries: modelEntries,
          compactValues: modelsByTokens,
          emptyText: SettingsUIStrings.noActivityYet,
          footer: modelsByTokens && !information.tokens.providers.isEmpty
            ? SettingsUIStrings.tokensFrom(
              information.tokens.providers.map(\.label).joined(separator: ", ")
            ) : nil
        )
      }
      if showsAccounts {
        ProfileBreakdownSection(
          title: SettingsUIStrings.accounts,
          caption: accountsByTokens
            ? SettingsUIStrings.byTokens : SettingsUIStrings.byPrompts,
          entries: accountEntries,
          compactValues: accountsByTokens,
          emptyText: SettingsUIStrings.noActivityYet,
          limit: 12
        )
      }
      ProfileBreakdownSection(
        title: SettingsUIStrings.modes,
        entries: information.core.modes.map(ProfileBreakdownItem.init),
        emptyText: SettingsUIStrings.noThreadsYet
      )
      ProfileAIActionsSection(actions: information.core.aiActions)
    }
  }

  private var activityInsights: some View {
    let insights = information.core.insights
    let totals = information.core.totals
    let rows = [
      ProfileKeyValue(
        label: SettingsUIStrings.mostUsedProvider,
        value: ProfilePresentation.breakdownSummary(insights.topProvider)
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.mostUsedReasoning,
        value: ProfilePresentation.breakdownSummary(insights.topReasoning)
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.fastMode,
        value: ProfilePresentation.percent(insights.fastModePercent)
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.mostActiveHour,
        value: insights.mostActiveHour?.label ?? "-"
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.messagesSent, value: totals.messagesSent.formatted()),
      ProfileKeyValue(label: SettingsUIStrings.goalsSet, value: totals.goalsSet.formatted()),
      ProfileKeyValue(
        label: SettingsUIStrings.skillsExplored,
        value: insights.skillsExplored.formatted()
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.skillRuns,
        value: insights.totalSkillsUsed.formatted()
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.workflowRuns,
        value: insights.workflowRuns.formatted()
      ),
      ProfileKeyValue(
        label: SettingsUIStrings.subagentRuns,
        value: insights.subagentRuns.formatted()
      ),
      ProfileKeyValue(label: SettingsUIStrings.mcpCalls, value: insights.mcpToolCalls.formatted()),
      ProfileKeyValue(
        label: SettingsUIStrings.totalThreads, value: totals.totalThreads.formatted()),
      ProfileKeyValue(
        label: SettingsUIStrings.totalPrompts, value: totals.totalPrompts.formatted()),
    ]

    return VStack(alignment: .leading, spacing: 0) {
      ProfileSectionHeading(SettingsUIStrings.activityInsights)
      ForEach(rows) { row in
        HStack(spacing: 16) {
          Text(row.label).foregroundStyle(.secondary)
          Spacer(minLength: 8)
          Text(row.value)
            .fontWeight(.medium)
            .monospacedDigit()
        }
        .font(.subheadline)
        .padding(.vertical, 9)
        .accessibilityElement(children: .combine)
        if row.id != rows.last?.id { Divider() }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func recentTrendsSection(_ recent: SettingsProfileRecentActivity) -> some View {
    let monthly = window == .thirtyDays
    let current = monthly ? recent.last30d : recent.last7d
    let previous = monthly ? recent.prev30d : recent.prev7d
    var rows: [ProfileKeyValue] = []

    let yesterdaySummary: String = {
      let count = SettingsUIStrings.promptsCount(recent.yesterday.prompts)
      if let top = recent.yesterday.providers.first, recent.yesterday.prompts > 0 {
        return "\(count) · \(top.label) (\(ProfilePresentation.percent(top.percent)))"
      }
      return count
    }()
    rows.append(ProfileKeyValue(label: SettingsUIStrings.yesterdayLabel, value: yesterdaySummary))

    let periodLabel = monthly
      ? SettingsUIStrings.lastThirtyDaysLabel : SettingsUIStrings.lastSevenDaysLabel
    let periodDelta: String = {
      let base = SettingsUIStrings.promptsCount(current.prompts)
      guard previous.prompts > 0 else { return base }
      let pct = Int((((Double(current.prompts - previous.prompts)) / Double(previous.prompts)) * 100).rounded())
      let sign = pct >= 0 ? "+" : ""
      return "\(base) (\(sign)\(pct)%)"
    }()
    rows.append(ProfileKeyValue(label: periodLabel, value: periodDelta))

    if let prevTop = recent.prev7d.providers.first,
      let currTop = recent.last7d.providers.first,
      recent.prev7d.prompts >= 8,
      recent.last7d.prompts >= 8,
      prevTop.key != currTop.key,
      prevTop.percent >= 30,
      currTop.percent >= 30
    {
      rows.append(
        ProfileKeyValue(
          label: SettingsUIStrings.switchedProvider,
          value: SettingsUIStrings.switchedFromTo(prevTop.label, to: currTop.label)
        )
      )
    }

    if let prevModel = recent.prev7d.models.first,
      let currModel = recent.last7d.models.first,
      recent.prev7d.prompts >= 8,
      recent.last7d.prompts >= 8,
      prevModel.key != currModel.key,
      prevModel.percent >= 30,
      currModel.percent >= 30
    {
      rows.append(
        ProfileKeyValue(
          label: SettingsUIStrings.switchedModel,
          value: SettingsUIStrings.switchedFromTo(
            compactModelLabel(prevModel),
            to: compactModelLabel(currModel)
          )
        )
      )
    }

    let prevByKey = Dictionary(uniqueKeysWithValues: recent.prev7d.providers.map { ($0.key, $0) })
    let currByKey = Dictionary(uniqueKeysWithValues: recent.last7d.providers.map { ($0.key, $0) })
    let movers = Set(prevByKey.keys).union(currByKey.keys).compactMap { key -> (String, Int)? in
      let prevCount = prevByKey[key]?.count ?? 0
      let currCount = currByKey[key]?.count ?? 0
      guard prevCount >= 5, abs(currCount - prevCount) >= 3 else { return nil }
      let pct = Int((((currCount - prevCount) / prevCount) * 100).rounded())
      guard abs(pct) >= 15 else { return nil }
      let label = currByKey[key]?.label ?? prevByKey[key]!.label
      return (label, pct)
    }.sorted { abs($0.1) > abs($1.1) }

    for (label, pct) in movers.prefix(2) {
      let desc = pct < 0
        ? SettingsUIStrings.providerUsedLess(label, percent: abs(pct))
        : SettingsUIStrings.providerUsedMore(label, percent: pct)
      rows.append(ProfileKeyValue(label: SettingsUIStrings.trendsTitle, value: desc))
    }

    if current.prompts > 0, current.totalTurnMs > 0 {
      let avgMs = current.totalTurnMs / current.prompts
      if avgMs >= 1_000 {
        rows.append(
          ProfileKeyValue(
            label: SettingsUIStrings.avgTaskDuration,
            value: ProfilePresentation.duration(avgMs)
          )
        )
      }
    }

    let rhythmTotal = recent.last30d.weekdayPrompts + recent.last30d.weekendPrompts
    if rhythmTotal >= 15, recent.last30d.weekendPrompts > 0 {
      let weekendPct = Int(((Double(recent.last30d.weekendPrompts) / Double(rhythmTotal)) * 100).rounded())
      rows.append(
        ProfileKeyValue(
          label: SettingsUIStrings.weekendShare,
          value: ProfilePresentation.percent(Double(weekendPct))
        )
      )
    }

    if let tokRecent = information.tokens.recent {
      let tokPeriod = monthly ? tokRecent.last30d : tokRecent.last7d
      let inputTotal = tokPeriod.inputTokens + tokPeriod.cacheReadTokens + tokPeriod.cacheWriteTokens
      if inputTotal >= 10_000, tokPeriod.cacheReadTokens > 0 {
        let pct = Int(((Double(tokPeriod.cacheReadTokens) / Double(inputTotal)) * 100).rounded())
        rows.append(
          ProfileKeyValue(
            label: SettingsUIStrings.promptCacheHit,
            value: ProfilePresentation.percent(Double(pct))
          )
        )
      }
    }

    return VStack(alignment: .leading, spacing: 0) {
      ProfileSectionHeading(SettingsUIStrings.trendsTitle)
      ForEach(rows) { row in
        HStack(spacing: 16) {
          Text(row.label).foregroundStyle(.secondary)
          Spacer(minLength: 8)
          Text(row.value)
            .fontWeight(.medium)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
        }
        .font(.subheadline)
        .padding(.vertical, 9)
        .accessibilityElement(children: .combine)
        if row.id != rows.last?.id { Divider() }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func compactModelLabel(_ entry: SettingsProfileBreakdown) -> String {
    let sep = "\u{1F}"
    if let range = entry.key.range(of: sep) {
      return String(entry.key[range.upperBound...])
    }
    return entry.label
  }

  private var usesTokens: Bool { metric == .tokens && information.tokens.available }

  private var providersByTokens: Bool {
    usesTokens && !information.tokens.providers.isEmpty
  }

  private var providerEntries: [ProfileBreakdownItem] {
    if providersByTokens {
      return information.tokens.providers.map(ProfileBreakdownItem.init)
    }
    return information.core.providers.map(ProfileBreakdownItem.init)
  }

  private var accountsByTokens: Bool {
    usesTokens && !information.tokens.accounts.isEmpty
  }

  private var accountEntries: [ProfileBreakdownItem] {
    if accountsByTokens {
      return information.tokens.accounts.map(ProfileBreakdownItem.init)
    }
    return information.core.accounts.map(ProfileBreakdownItem.init)
  }

  private var showsAccounts: Bool {
    selectedAccount == nil && accountEntries.contains { $0.id.contains(":") }
  }

  private var modelsByTokens: Bool {
    usesTokens && !information.tokens.models.isEmpty
  }

  private var modelEntries: [ProfileBreakdownItem] {
    let entries = modelsByTokens ? information.tokens.models : information.core.models
    return entries.map(ProfileBreakdownItem.init)
  }
}
