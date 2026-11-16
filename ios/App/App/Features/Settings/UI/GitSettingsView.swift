import SwiftUI
import UIKit

struct GitSettingsView: View {
  @Bindable var session: AppSession
  @State private var composition: SettingsComposition

  init(session: AppSession) {
    self.session = session
    _composition = State(
      initialValue: SettingsComposition(gateway: session.makeSettingsSessionGateway())
    )
  }

  var body: some View {
    Group {
      if let failure = composition.gate(.sessionRead) {
        SettingsUnavailableView(failure: failure)
      } else {
        SettingsGitView(composition: composition, refresh: refresh)
      }
    }
    .navigationTitle(SettingsUIStrings.gitTitle)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: refreshIdentity) {
      composition.activate(activeSelection)
      await composition.refresh(route: .workspace, query: SettingsProfileQuery())
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HostSelectionMenu(session: session)
      }
    }
    .overlay(alignment: .bottom) {
      SettingsMutationBanner(
        notice: composition.mutationNotice,
        failure: composition.mutationFailure,
        dismiss: composition.clearMutationFeedback
      )
      .padding()
    }
  }

  private var activeSelection: SettingsHostSelection? {
    session.currentSettingsHostSelection
  }

  private var refreshIdentity: SettingsRefreshIdentity {
    SettingsRefreshIdentity(
      selection: activeSelection,
      route: .workspace,
      query: SettingsProfileQuery()
    )
  }

  private func refresh() {
    Task { await composition.refresh(route: .workspace, query: SettingsProfileQuery()) }
  }
}
