import SwiftUI

struct SettingsIntegrationsAccessView: View {
  let failure: SettingsIntegrationsFailure

  var body: some View {
    ContentUnavailableView {
      Label(SettingsIntegrationsStrings.title, systemImage: "puzzlepiece.extension")
    } description: {
      Text(SettingsIntegrationsStrings.failure(failure))
    }
  }
}

struct SettingsIntegrationsLoadView: View {
  let state: SettingsIntegrationsLoadState
  let empty: Bool
  let emptyMessage: String

  var body: some View {
    switch state {
    case .idle, .loading:
      ProgressView()
        .frame(maxWidth: .infinity, minHeight: 160)
    case .failed(let failure):
      ContentUnavailableView(
        SettingsIntegrationsStrings.failure(failure),
        systemImage: "exclamationmark.triangle"
      )
    case .loaded where empty:
      ContentUnavailableView(emptyMessage, systemImage: "tray")
    case .loaded:
      EmptyView()
    }
  }
}

struct SettingsIntegrationsFeedbackView: View {
  let notice: SettingsIntegrationsMutationNotice?
  let failure: SettingsIntegrationsFailure?

  var body: some View {
    if let failure {
      Label(SettingsIntegrationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
        .foregroundStyle(.secondary)
    } else if let notice {
      Label(text(notice), systemImage: "checkmark.circle")
        .foregroundStyle(.secondary)
    }
  }

  private func text(_ notice: SettingsIntegrationsMutationNotice) -> String {
    switch notice {
    case .saved: SettingsIntegrationsStrings.saved
    case .ambiguousReconciled: SettingsIntegrationsStrings.reconciled
    case .ambiguousUnresolved: SettingsIntegrationsStrings.unresolved
    }
  }
}
