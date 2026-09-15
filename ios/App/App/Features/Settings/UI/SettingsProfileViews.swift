import SwiftUI

struct SettingsActivityView: View {
  @Bindable var controller: SettingsProfileController
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  var body: some View {
    SettingsProfileState(controller: controller, refresh: refresh) { information in
      VStack(spacing: 0) {
        SettingsFilterBar(
          query: $query,
          devices: [information.core.device],
          providers: information.core.providers
        )
        List {
          Section(SettingsUIStrings.activityTitle) {
            SettingsMetricRow(
              label: SettingsUIStrings.totalThreads,
              value: information.core.totals.totalThreads.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.totalPrompts,
              value: information.core.totals.totalPrompts.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.messagesSent,
              value: information.core.totals.messagesSent.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.goalsSet,
              value: information.core.totals.goalsSet.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.activeDays,
              value: information.core.totals.activeDays.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.currentStreak,
              value: information.core.totals.currentStreakDays.formatted()
            )
          }
          Section(SettingsUIStrings.skills) {
            SettingsMetricRow(
              label: SettingsUIStrings.workflows,
              value: information.core.insights.workflowRuns.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.subagents,
              value: information.core.insights.subagentRuns.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.skills,
              value: information.core.insights.totalSkillsUsed.formatted()
            )
            SettingsMetricRow(
              label: SettingsUIStrings.mcpCalls,
              value: information.core.insights.mcpToolCalls.formatted()
            )
          }
        }
        .listStyle(.insetGrouped)
        .refreshable { refresh() }
      }
    }
  }
}

struct SettingsTokensView: View {
  @Bindable var controller: SettingsProfileController
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  var body: some View {
    SettingsProfileState(controller: controller, refresh: refresh) { information in
      VStack(spacing: 0) {
        SettingsFilterBar(
          query: $query,
          devices: [information.tokens.device],
          providers: information.core.providers
        )
        if information.tokens.available {
          List {
            Section(SettingsUIStrings.tokensTitle) {
              SettingsMetricRow(
                label: SettingsUIStrings.totalTokens,
                value: information.tokens.lifetimeTokens.formatted()
              )
              SettingsMetricRow(
                label: SettingsUIStrings.peakDay,
                value: information.tokens.peakDayTokens.formatted()
              )
            }
            ForEach(information.tokens.providers, id: \.provider) { provider in
              Section(provider.label) {
                SettingsMetricRow(
                  label: SettingsUIStrings.totalTokens,
                  value: provider.tokens.formatted()
                )
                if let cost = provider.estimatedCostUsd {
                  SettingsMetricRow(
                    label: SettingsUIStrings.cost,
                    value: cost.formatted(.currency(code: "USD"))
                  )
                }
              }
            }
          }
          .listStyle(.insetGrouped)
          .refreshable { refresh() }
        } else {
          ContentUnavailableView {
            Label(SettingsUIStrings.tokensTitle, systemImage: "number.circle")
          } description: {
            Text(SettingsUIStrings.tokensUnavailable)
          }
        }
      }
    }
  }
}

struct SettingsProfileView: View {
  let composition: SettingsComposition
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  @State private var editor: SettingsIdentityEditorItem?

  var body: some View {
    SettingsProfileState(controller: composition.profile, refresh: refresh) { information in
      let identity = composition.profile.identity?.identity ?? information.core.identity
      SettingsProfileDashboard(
        information: information,
        query: $query,
        canEdit: composition.gate(.sessionOperate) == nil,
        edit: { editor = SettingsIdentityEditorItem(identity: identity) },
        refresh: refresh
      )
      .sheet(item: $editor) { item in
        SettingsIdentityEditor(
          initialIdentity: item.identity,
          composition: composition,
          query: query
        )
      }
    }
  }
}

private struct SettingsIdentityEditorItem: Identifiable {
  let id = UUID()
  let identity: SettingsProfileIdentity
}

private struct SettingsIdentityEditor: View {
  let composition: SettingsComposition
  let query: SettingsProfileQuery

  @Environment(\.dismiss) private var dismiss
  @State private var draft: SettingsProfileIdentityDraft

  init(
    initialIdentity: SettingsProfileIdentity,
    composition: SettingsComposition,
    query: SettingsProfileQuery
  ) {
    self.composition = composition
    self.query = query
    _draft = State(initialValue: SettingsProfileIdentityDraft(initialIdentity))
  }

  var body: some View {
    NavigationStack {
      Form {
        TextField(SettingsUIStrings.name, text: $draft.name)
          .textInputAutocapitalization(.words)
        TextField(SettingsUIStrings.handle, text: $draft.handle)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        TextField(SettingsUIStrings.avatarColor, text: $draft.avatarColor)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      }
      .navigationTitle(SettingsUIStrings.identityEditorTitle)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(SettingsUIStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.save) {
            Task {
              await composition.setIdentity(draft, query: query)
              if composition.mutationNotice == .saved
                || composition.mutationNotice == .ambiguousRefreshed
              {
                dismiss()
              }
            }
          }
          .disabled(!draft.isValid || composition.isMutating)
        }
      }
    }
  }
}

private struct SettingsProfileState<Content: View>: View {
  @Bindable var controller: SettingsProfileController
  let refresh: () -> Void
  @ViewBuilder let content: (SettingsProfileInformation) -> Content

  var body: some View {
    if let information = controller.information {
      content(information)
        .overlay(alignment: .bottom) {
          if case .failed(let failure) = controller.state {
            SettingsRefreshFailureBanner(failure: failure, retry: refresh)
              .padding()
          }
        }
    } else {
      switch controller.state {
      case .idle, .loading, .loaded:
        SettingsLoadingView()
      case .failed(let failure):
        SettingsUnavailableView(failure: failure, retry: refresh)
      }
    }
  }
}
