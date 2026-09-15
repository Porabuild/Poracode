import SwiftUI
import UIKit

struct ProjectNotesThreadComposeIntent: Identifiable {
  let id = UUID()
  let identity: ProjectIdentity
  let prompt: String
}

struct ProjectNotesStartedThread: Hashable, Identifiable {
  let identity: ProjectIdentity
  let threadID: String

  var id: String { "\(identity.connectionId.rawValue):\(threadID)" }
}

struct ProjectNotesThreadComposeSheet: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let intent: ProjectNotesThreadComposeIntent
  let onStarted: (ProjectNotesStartedThread) -> Void

  @State private var isExpanded = true
  @State private var ready = false

  var body: some View {
    NavigationStack {
      Group {
        if ready {
          VStack {
            Spacer(minLength: 0)
            HomeQuickComposeView(
              session: session,
              isExpanded: $isExpanded,
              launchSeed: HomeThreadLaunchSeed(
                fixedProjectID: intent.identity.projectId,
                initialPrompt: intent.prompt
              )
            ) { threadID in
              onStarted(
                ProjectNotesStartedThread(identity: intent.identity, threadID: threadID)
              )
              dismiss()
            }
            .padding()
          }
          .background(Color(uiColor: .systemGroupedBackground))
        } else {
          LoadingStateView(message: HomeStrings.loadingProjects)
        }
      }
      .navigationTitle(HomeStrings.newThread)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(HomeStrings.cancel) { dismiss() }
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .task(id: intent.id) {
      if session.selectedConnectionId != intent.identity.connectionId {
        await session.switchHost(intent.identity.connectionId)
      }
      ready =
        session.selectedConnectionId == intent.identity.connectionId
        && session.projects.contains { $0.id == intent.identity.projectId }
    }
  }
}

struct ProjectNotesThreadDestination: View {
  @Bindable var session: AppSession
  let target: ProjectNotesStartedThread

  @State private var ready = false

  var body: some View {
    Group {
      if ready {
        RichChatThreadView(
          session: session,
          threadID: target.threadID,
          title: HomeStrings.newThread
        )
      } else {
        LoadingStateView(message: HomeStrings.loadingThreads)
      }
    }
    .task(id: target.id) {
      if session.selectedConnectionId != target.identity.connectionId {
        await session.switchHost(target.identity.connectionId)
      }
      ready = session.selectedConnectionId == target.identity.connectionId
    }
  }
}
