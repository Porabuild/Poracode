import SwiftUI

enum ThreadStatusPresentation {
  static func resolvedStatus(
    status: String,
    attention: String,
    hasBackgroundActivity: Bool
  ) -> String {
    if status == "needs_approval" || attention == "needs_approval" {
      return "needs_approval"
    }
    if status == "needs_reply" || attention == "needs_reply" {
      return "needs_reply"
    }
    if status == "working" || attention == "working" { return "working" }
    if hasBackgroundActivity && (status == "finished" || status == "idle") {
      return "working"
    }
    return status
  }
}

/// Compact native navigation title matching the PWA thread header hierarchy:
/// provider state, thread title, project, and paired desktop. Tapping it opens
/// the status detail with native popover-to-sheet adaptation.
struct ThreadDetailTitleView: View {
  @Bindable var session: AppSession
  let thread: RemoteThread
  let project: RemoteProject
  var hasBackgroundActivity = false
  var showsProviderBadge = true

  @State private var showsStatus = false

  var body: some View {
    Button {
      showsStatus = true
    } label: {
      HStack(spacing: 6) {
        if showsProviderBadge { providerBadge }
        VStack(alignment: .leading, spacing: 1) {
          Text(thread.title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(metadata)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(agentLabel), \(statusLabel), \(metadata)")
    .popover(isPresented: $showsStatus, arrowEdge: .top) {
      statusDetail
        .presentationCompactAdaptation(.sheet)
    }
  }

  private var providerBadge: some View {
    ZStack {
      Circle().fill(Color.secondary.opacity(0.12))
      HomeProviderIcon(kind: thread.agentKind)
        .foregroundStyle(.secondary)
        .frame(width: 13, height: 13)
    }
    .frame(width: 24, height: 24)
    .overlay(Circle().stroke(Color.secondary.opacity(0.2), lineWidth: 0.5))
    .overlay(alignment: .bottomTrailing) {
      if showsStatusIndicator {
        Circle()
          .fill(statusTint)
          .frame(width: 6, height: 6)
          .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 1))
      }
    }
  }

  private var statusDetail: some View {
    NavigationStack {
      List {
        Section {
          LabeledContent(RemoteIntegrationsStrings.status, value: statusLabel)
          LabeledContent(
            ThreadLifecycleStrings.supportTitle,
            value: ThreadLifecycleStrings.supportSource(thread.threadStatusSource)
          )
          LabeledContent(HomeStrings.agent, value: agentLabel)
          LabeledContent(HomeStrings.project, value: project.name)
          if !hostLabel.isEmpty {
            LabeledContent(SettingsUIStrings.selectedHost, value: hostLabel)
          }
        } footer: {
          Text(ThreadLifecycleStrings.supportDescription(thread.threadStatusSource))
        }
        if let error = thread.errorMessage?.trimmingCharacters(in: .whitespacesAndNewlines),
          !error.isEmpty
        {
          Section {
            Text(error)
              .foregroundStyle(.red)
              .textSelection(.enabled)
          }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(thread.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(SettingsUIStrings.done) { showsStatus = false }
        }
      }
    }
    .presentationDetents([.medium])
  }

  private var statusLabel: String {
    ThreadLifecycleStrings.status(resolvedStatus)
  }

  private var resolvedStatus: String {
    ThreadStatusPresentation.resolvedStatus(
      status: thread.status,
      attention: thread.attention,
      hasBackgroundActivity: hasBackgroundActivity
    )
  }

  private var agentLabel: String {
    session.state.replay.agentStatuses.ordered.first { $0.kind == thread.agentKind }?.label
      ?? thread.agentKind
  }

  private var hostLabel: String {
    guard let connectionID = session.selectedConnectionId else { return "" }
    let label = session.state.hosts.first { $0.connectionId == connectionID }?.label ?? ""
    return HomeDeviceName.display(label)
  }

  private var metadata: String {
    guard !hostLabel.isEmpty else { return project.name }
    return HomeStrings.projectOnHost(project.name, hostLabel)
  }

  private var statusTint: Color {
    if thread.isDone { return .secondary }
    switch resolvedStatus {
    case "working", "launching": return .green
    case "needs_approval": return .orange
    case "needs_reply": return .blue
    case "error": return .red
    case "finished": return .indigo
    case "inactive": return .secondary
    default: return .accentColor
    }
  }

  private var showsStatusIndicator: Bool {
    ["working", "launching", "needs_approval", "needs_reply", "error"].contains(resolvedStatus)
  }
}
