import SwiftUI

struct SettingsActivityView: View {
  @Bindable var controller: SettingsProfileController
  let selection: SettingsHostSelection?
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  var body: some View {
    SettingsFilteredProfileMetrics(
      controller: controller, selection: selection, query: $query, refresh: refresh
    ) { information in
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
      .poracodeReadableListMargins(740)
      .refreshable { refresh() }
    }
  }
}

struct SettingsTokensView: View {
  @Bindable var controller: SettingsProfileController
  let selection: SettingsHostSelection?
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  var body: some View {
    SettingsFilteredProfileMetrics(
      controller: controller, selection: selection, query: $query, refresh: refresh
    ) { information in
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
        .poracodeReadableListMargins(740)
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

/// The filter controls use the last catalog for this desktop. Numerical
/// results appear only when the response matches the current filter.
private struct SettingsFilteredProfileMetrics<Content: View>: View {
  @Bindable var controller: SettingsProfileController
  let selection: SettingsHostSelection?
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void
  @ViewBuilder let content: (SettingsProfileInformation) -> Content

  var body: some View {
    let requested = query.request()
    SettingsProfileState(
      controller: controller, selection: selection, refresh: refresh,
      showsRefreshFailure: controller.information?.request == requested
    ) { information in
      VStack(spacing: 0) {
        SettingsFilterBar(query: $query, devices: information.devices, accounts: information.core.availableAccounts)
          .poracodeReadableWidth(740)
        if information.request == requested {
          content(information)
        } else if case .failed(let failure) = controller.state {
          SettingsUnavailableView(failure: failure, retry: refresh)
        } else {
          SettingsLoadingView()
        }
      }
    }
  }
}

struct SettingsProfileView: View {
  @Bindable var session: AppSession
  let selection: SettingsHostSelection?
  let composition: SettingsComposition
  @Binding var query: SettingsProfileQuery
  let refresh: () -> Void

  @State private var editor: SettingsIdentityEditorItem?

  var body: some View {
    SettingsProfileState(controller: composition.profile, selection: selection, refresh: refresh) { information in
      let identity = composition.profile.identity?.identity ?? information.core.identity
      SettingsProfileDashboard(
        information: information,
        identity: identity,
        query: $query,
        canEdit: selection?.gate(.sessionOperate) == nil && !composition.isMutating,
        edit: {
          guard let selected = session.currentSettingsHostSelection,
            selected.lease == selection?.lease, selected.gate(.sessionOperate) == nil,
            composition.profile.lease == selected.lease
          else { return }
          composition.clearMutationFeedback()
          editor = SettingsIdentityEditorItem(identity: identity, host: selected)
        },
        refresh: refresh
      )
    }
    .sheet(item: $editor) { item in
      SettingsIdentityEditor(item: item, session: session, composition: composition, query: query)
        .poracodeFormSheetSizing()
    }
  }
}

private struct SettingsIdentityEditorItem: Identifiable {
  let id = UUID()
  let identity: SettingsProfileIdentity
  let host: SettingsHostSelection
}

private struct SettingsIdentityEditor: View {
  let item: SettingsIdentityEditorItem
  @Bindable var session: AppSession
  let composition: SettingsComposition
  let query: SettingsProfileQuery

  @Environment(\.dismiss) private var dismiss
  @State private var draft: SettingsProfileIdentityDraft

  init(
    item: SettingsIdentityEditorItem,
    session: AppSession,
    composition: SettingsComposition,
    query: SettingsProfileQuery
  ) {
    self.item = item
    self.session = session
    self.composition = composition
    self.query = query
    _draft = State(initialValue: SettingsProfileIdentityDraft(item.identity))
  }

  private var hasSourceAccess: Bool {
    guard let current = session.currentSettingsHostSelection else { return false }
    return current.lease == item.host.lease && current.gate(.sessionOperate) == nil
      && composition.profile.lease == item.host.lease
  }

  private var isSaving: Bool { hasSourceAccess && composition.isMutating }

  var body: some View {
    NavigationStack {
      Form {
        if !hasSourceAccess {
          Section {
            Label(item.host.name, systemImage: "desktopcomputer")
            Text(SettingsUIStrings.readOnly).foregroundStyle(.secondary)
          }
        } else if let failure = composition.mutationFailure {
          Text(SettingsUIStrings.failure(failure)).foregroundStyle(.secondary)
        } else if let notice = composition.mutationNotice, notice != .saved {
          Text(SettingsUIStrings.mutationNotice(notice)).foregroundStyle(.secondary)
        }
        Section {
          TextField(SettingsUIStrings.name, text: $draft.name)
            .textInputAutocapitalization(.words)
          TextField(SettingsUIStrings.handle, text: $draft.handle)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
          TextField(SettingsUIStrings.avatarColor, text: $draft.avatarColor)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        .disabled(!hasSourceAccess || isSaving)
      }
      .navigationTitle(SettingsUIStrings.identityEditorTitle)
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(SettingsUIStrings.cancel, systemImage: "xmark") { dismiss() }
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.save, systemImage: "checkmark") {
            guard hasSourceAccess, draft.isValid, !isSaving else { return }
            let proposed = draft
            Task {
              guard hasSourceAccess else { return }
              let saved = await composition.setIdentity(proposed, lease: item.host.lease, query: query)
              if saved, hasSourceAccess {
                dismiss()
              }
            }
          }
          .disabled(!hasSourceAccess || !draft.isValid || isSaving)
          .accessibilityIdentifier("native-e2e.profile.save")
        }
      }
    }
    .interactiveDismissDisabled(isSaving)
  }
}

private struct SettingsProfileState<Content: View>: View {
  @Bindable var controller: SettingsProfileController
  let selection: SettingsHostSelection?
  let refresh: () -> Void
  var showsRefreshFailure = true
  @ViewBuilder let content: (SettingsProfileInformation) -> Content

  private var failure: SettingsOperationFailure? {
    guard let selection else { return .offline }
    return selection.gate(.sessionRead)
  }

  var body: some View {
    if let failure, failure != .notReady {
      SettingsUnavailableView(failure: failure, retry: refresh)
    } else if failure != nil || selection?.lease != controller.lease {
      SettingsLoadingView()
    } else if let information = controller.information {
      content(information)
        .overlay(alignment: .bottom) {
          if showsRefreshFailure, case .failed(let failure) = controller.state {
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
