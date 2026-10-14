import SwiftUI

struct ProjectWorkspaceAccessView: View {
  let state: ProjectWorkspaceAccessState

  var body: some View {
    switch state {
    case .unavailable:
      unavailable(
        ProjectWorkspaceStrings.unavailable,
        description: ProjectWorkspaceStrings.unavailableDescription,
        systemImage: "folder.badge.questionmark"
      )
    case .inconsistentSelection:
      unavailable(
        ProjectWorkspaceStrings.selectionChanged,
        description: ProjectWorkspaceStrings.selectionChangedDescription,
        systemImage: "arrow.triangle.2.circlepath"
      )
    case .offline:
      unavailable(
        ProjectWorkspaceStrings.offline,
        description: ProjectWorkspaceStrings.offlineDescription,
        systemImage: "wifi.slash"
      )
    case .connecting:
      unavailable(
        ProjectWorkspaceStrings.connecting,
        description: ProjectWorkspaceStrings.connectingDescription,
        systemImage: "network"
      )
    case .missingReadScope:
      unavailable(
        ProjectWorkspaceStrings.permissionRequired,
        description: ProjectWorkspaceStrings.permissionRequiredDescription,
        systemImage: "lock"
      )
    case .ready:
      EmptyView()
    }
  }

  private func unavailable(
    _ title: String,
    description: String,
    systemImage: String
  ) -> some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      Text(description)
    }
    .accessibilityElement(children: .combine)
  }
}

struct ProjectWorkspaceFailureView: View {
  let failure: ProjectOperationFailure
  let retry: (() -> Void)?

  var body: some View {
    ContentUnavailableView {
      Label(ProjectWorkspaceStrings.errorTitle, systemImage: "exclamationmark.triangle")
    } description: {
      Text(ProjectWorkspaceStrings.failureMessage(failure))
    } actions: {
      if let retry {
        Button(ProjectWorkspaceStrings.retry, action: retry)
          .poracodeProminentButtonStyle()
      }
    }
    .accessibilityElement(children: .contain)
  }
}

struct ProjectWorkspaceLoadingView: View {
  var body: some View {
    VStack(spacing: 12) {
      ProgressView()
      Text(ProjectWorkspaceStrings.loading)
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
  }
}

struct ProjectWorkspaceTruncationNotice: View {
  let text: String

  var body: some View {
    Label(text, systemImage: "ellipsis.circle")
      .font(.caption)
      .foregroundStyle(.secondary)
      .accessibilityElement(children: .combine)
  }
}
