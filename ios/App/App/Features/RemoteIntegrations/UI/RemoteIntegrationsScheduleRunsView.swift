import SwiftUI

struct RemoteIntegrationsScheduleRunsView: View {
  @Environment(\.dismiss) private var dismiss

  @Bindable var session: AppSession
  let schedule: RemoteIntegrationsScheduledTask
  let controller: RemoteIntegrationsScheduleRunsController

  var body: some View {
    NavigationStack {
      content
        .navigationTitle(schedule.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RemoteIntegrationsStrings.dismiss) { dismiss() }
          }
        }
        .refreshable { await controller.load(scheduleID: schedule.id) }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .presentationCornerRadius(28)
    .task(id: schedule.id) {
      await controller.load(scheduleID: schedule.id)
      while !Task.isCancelled, controller.runs.contains(where: { $0.status == .running }) {
        do {
          try await Task.sleep(for: .seconds(2))
        } catch {
          return
        }
        await controller.load(scheduleID: schedule.id)
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch controller.state {
    case .idle, .loading:
      RemoteIntegrationsLoadingView()
    case .failed(let failure):
      RemoteIntegrationsUnavailableView(failure: failure) {
        Task { await controller.load(scheduleID: schedule.id) }
      }
    case .loaded:
      if controller.runs.isEmpty {
        ContentUnavailableView(
          RemoteIntegrationsStrings.noRuns,
          systemImage: "clock.arrow.circlepath"
        )
      } else {
        List(controller.runs) { run in
          runRow(run)
        }
        .listStyle(.insetGrouped)
      }
    }
  }

  @ViewBuilder
  private func runRow(_ run: RemoteIntegrationsScheduleRun) -> some View {
    if let thread = session.richChatThread(id: run.threadId) {
      NavigationLink {
        RichChatThreadView(
          session: session,
          threadID: thread.id,
          title: thread.title
        )
      } label: {
        rowLabel(run, thread: thread)
      }
    } else {
      rowLabel(run, thread: nil)
        .foregroundStyle(.secondary)
    }
  }

  private func rowLabel(
    _ run: RemoteIntegrationsScheduleRun,
    thread: RemoteThread?
  ) -> some View {
    HStack(spacing: 12) {
      Image(systemName: statusImage(run.status))
        .foregroundStyle(statusColor(run.status))
        .symbolEffect(.pulse, isActive: run.status == .running)
      VStack(alignment: .leading, spacing: 3) {
        if let thread {
          Text(thread.title)
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(thread.config.model)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Text(RemoteIntegrationsPresentation.scheduleRunStatus(run.status))
          .font(.caption)
          .foregroundStyle(run.status == .failed ? .red : .secondary)
      }
      Spacer(minLength: 8)
      Text(RemoteIntegrationsPresentation.formattedDate(run.startedAt) ?? run.startedAt)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.trailing)
    }
    .padding(.vertical, 3)
  }

  private func statusImage(_ status: RemoteIntegrationsScheduleRunStatus) -> String {
    switch status {
    case .running: "progress.indicator"
    case .succeeded: "checkmark.circle.fill"
    case .failed: "xmark.circle.fill"
    case .interrupted: "pause.circle.fill"
    }
  }

  private func statusColor(_ status: RemoteIntegrationsScheduleRunStatus) -> Color {
    switch status {
    case .running: .accentColor
    case .succeeded: .green
    case .failed: .red
    case .interrupted: .secondary
    }
  }
}
