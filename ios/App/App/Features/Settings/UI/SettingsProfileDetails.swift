import SwiftUI

/// The sections below the profile heatmap. Their order and metric-switching rules
/// intentionally follow the PWA `ProfileSettings` composition.
struct SettingsProfileDetails: View {
  let information: SettingsProfileInformation
  let metric: SettingsProfileHeatmapMetric
  let selectedAccount: String?

  var body: some View {
    VStack(spacing: 28) {
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
