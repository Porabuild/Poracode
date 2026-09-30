import SwiftUI

struct RemoteIntegrationsUpdateView: View {
  let selection: RemoteIntegrationsHostSelection?
  let composition: RemoteIntegrationsComposition
  let isPresentationActive: Bool

  @State private var confirmingInstall = false

  var body: some View {
    Group {
      if let failure = composition.gate(.projectsManage) {
        RemoteIntegrationsUnavailableView(failure: failure)
      } else {
        content
      }
    }
    .navigationTitle(RemoteIntegrationsStrings.update)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: loadIdentity) {
      guard isPresentationActive else { return }
      composition.activate(selection)
      await composition.update.load()
    }
    .refreshable { await composition.update.load() }
    .overlay(alignment: .bottom) {
      RemoteIntegrationsMutationBanner(
        notice: composition.update.notice,
        failure: composition.update.mutationFailure,
        dismiss: composition.update.clearFeedback
      )
      .padding()
    }
    .alert(RemoteIntegrationsStrings.installTitle, isPresented: $confirmingInstall) {
      Button(RemoteIntegrationsStrings.cancel, role: .cancel) {}
      Button(RemoteIntegrationsStrings.installUpdate) {
        Task { await composition.update.install() }
      }
    } message: {
      Text(RemoteIntegrationsStrings.installMessage)
    }
  }

  private var loadIdentity: RemoteIntegrationsLoadIdentity {
    RemoteIntegrationsLoadIdentity(
      lease: selection?.lease,
      lifecycleGeneration: composition.lifecycleGeneration,
      isPresentationActive: isPresentationActive
    )
  }

  @ViewBuilder
  private var content: some View {
    switch composition.update.state {
    case .idle, .loading:
      RemoteIntegrationsLoadingView()
    case .failed(let failure):
      RemoteIntegrationsUnavailableView(failure: failure) {
        Task { await composition.update.load() }
      }
    case .loaded:
      updateForm
    }
  }

  private var updateForm: some View {
    Form {
      Section {
        LabeledContent(RemoteIntegrationsStrings.currentVersion) {
          Text(composition.update.update?.currentVersion ?? "—")
            .monospacedDigit()
        }
        LabeledContent(RemoteIntegrationsStrings.status) {
          Text(
            RemoteIntegrationsPresentation.updateStatus(composition.update.update?.status)
          )
          .multilineTextAlignment(.trailing)
        }
        if let progress = RemoteIntegrationsPresentation.progress(
          composition.update.update?.status
        ) {
          ProgressView(value: progress)
            .accessibilityLabel(RemoteIntegrationsStrings.downloading)
        }
      }

      Section {
        Button(RemoteIntegrationsStrings.checkForUpdates, systemImage: "arrow.clockwise") {
          Task { await composition.update.check() }
        }
        .disabled(composition.update.isMutating)

        if case .downloaded = composition.update.update?.status {
          Button(
            RemoteIntegrationsStrings.installUpdate,
            systemImage: "arrow.down.app",
            role: .destructive
          ) {
            confirmingInstall = true
          }
          .disabled(composition.update.isMutating)
        }
      }
    }
  }
}
