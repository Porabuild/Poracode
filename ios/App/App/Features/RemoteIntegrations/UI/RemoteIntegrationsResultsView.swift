import SwiftUI

struct RemoteIntegrationsResultsView: View {
  @Environment(\.dismiss) private var dismiss
  @Bindable var session: AppSession
  @Bindable var controller: RemoteIntegrationsAutomationsController
  let canOperate: Bool

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        Picker(RemoteAutomationsStrings.results, selection: $controller.filter) {
          Text(RemoteAutomationsStrings.unread).tag("unread")
          Text(RemoteIntegrationsStrings.filterAll).tag("all")
          Text(RemoteAutomationsStrings.archived).tag("archived")
        }
        .pickerStyle(.segmented)
        .padding()
        content
      }
      .navigationTitle(RemoteAutomationsStrings.results)
      .navigationBarTitleDisplayMode(.inline)
      .searchable(text: $controller.search, prompt: RemoteAutomationsStrings.searchResults)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RemoteIntegrationsStrings.dismiss) { dismiss() }
        }
      }
      .refreshable { await controller.load() }
    }
    .task(id: "\(controller.filter)|\(controller.search)") {
      do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
      await controller.load(reset: true)
    }
    .task {
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(controller.runs.contains(where: \.canCancel) ? 2 : 15)) } catch { return }
        await controller.load()
      }
    }
  }

  @ViewBuilder
  private var content: some View {
    switch controller.state {
    case .idle, .loading: RemoteIntegrationsLoadingView()
    case .failed(let failure):
      RemoteIntegrationsUnavailableView(failure: failure) { Task { await controller.load() } }
    case .loaded:
      List {
        if controller.runs.isEmpty {
          ContentUnavailableView(RemoteAutomationsStrings.noResults, systemImage: "tray")
        }
        ForEach(controller.runs) { run in
          NavigationLink {
            RemoteIntegrationsResultDetails(session: session, run: run, controller: controller, canOperate: canOperate)
          } label: {
            VStack(alignment: .leading, spacing: 5) {
              HStack {
                Text(controller.schedules.first(where: { $0.id == run.scheduleId })?.name ?? RemoteAutomationsStrings.result)
                  .font(.headline)
                if run.unread { Image(systemName: "circle.fill").font(.system(size: 7)).accessibilityLabel(RemoteAutomationsStrings.unread) }
                Spacer()
                Text(RemoteIntegrationsPresentation.scheduleRunStatus(run.status)).font(.caption).foregroundStyle(.secondary)
              }
              if let summary = run.result?["summary"]?.stringValue ?? run.summary {
                Text(summary).lineLimit(3).font(.subheadline).privacySensitive()
              }
              Text(RemoteIntegrationsPresentation.formattedDate(run.startedAt) ?? run.startedAt)
                .font(.caption).foregroundStyle(.secondary)
            }
          }
          .swipeActions(allowsFullSwipe: false) {
            Button(run.archived ? RemoteAutomationsStrings.restore : RemoteAutomationsStrings.archive) {
              Task { await controller.mark(run, archived: !run.archived) }
            }.disabled(controller.busy || !canOperate)
            Button(run.unread ? RemoteAutomationsStrings.markRead : RemoteAutomationsStrings.markUnread) {
              Task { await controller.mark(run, unread: !run.unread) }
            }.disabled(controller.busy || !canOperate)
          }

        }
        if controller.hasMore {
          Button(RemoteAutomationsStrings.loadMore) { Task { await controller.load(more: true) } }
            .disabled(controller.busy)
        }
        if let failure = controller.mutationFailure {
          RemoteIntegrationsUnavailableView(failure: failure)
        }
      }
    }
  }
}

struct RemoteIntegrationsResultDetails: View {
  @Bindable var session: AppSession
  let run: RemoteIntegrationsScheduleRun
  let controller: RemoteIntegrationsAutomationsController?
  var canOperate = false

  private var currentRun: RemoteIntegrationsScheduleRun {
    controller?.latestRunStates[run.id] ?? controller?.runs.first(where: { $0.id == run.id }) ?? run
  }

  var body: some View {
    let run = currentRun
    List {
      Section {
        LabeledContent(RemoteAutomationsStrings.status, value: RemoteIntegrationsPresentation.scheduleRunStatus(run.status))
        LabeledContent(RemoteAutomationsStrings.attempts, value: String(run.attempt))
        LabeledContent(RemoteAutomationsStrings.iteration, value: String(run.iteration))
        if let summary = run.result?["summary"]?.stringValue ?? run.summary { Text(summary).privacySensitive() }
        if run.hasError { Text(RemoteAutomationsStrings.safeError).foregroundStyle(.red) }
        if let reason = run.stopReason, let label = RemoteAutomationsStrings.stopReason(reason) { Text(label).font(.footnote).foregroundStyle(.secondary) }
      }
      if let evaluation = run.result?["completionEvaluation"] {
        Section(RemoteAutomationsStrings.stopCondition) {
          if let condition = evaluation["condition"]?.stringValue { Text(condition).privacySensitive() }
          if let reason = evaluation["reason"]?.stringValue { Text(reason).privacySensitive() }
          if let confidence = evaluation["confidence"]?.scheduleNumber {
            LabeledContent(RemoteAutomationsStrings.confidence) { Text(confidence, format: .percent) }
          }
        }
      }
      let files = run.result?["changedFiles"]?.scheduleStrings ?? []
      if !files.isEmpty {
        Section(RemoteAutomationsStrings.changedFiles) { ForEach(files, id: \.self) { Text($0).font(.footnote.monospaced()).privacySensitive() } }
      }
      if let thread = session.richChatThread(id: run.threadId) {
        NavigationLink(RemoteAutomationsStrings.openConversation) {
          RichChatThreadView(session: session, threadID: thread.id, title: thread.title)
        }
      }
      if let controller, canOperate {
        if let failure = controller.mutationFailure {
          RemoteIntegrationsUnavailableView(failure: failure)
        }
        Section {
          if let schedule = controller.schedules.first(where: { $0.id == run.scheduleId }), schedule.lastStatus != .running && schedule.lastStatus != .waiting {
            Button(RemoteAutomationsStrings.runAgain) { Task { await controller.runAgain(schedule.id) } }
          }
          if run.canCancel { Button(RemoteAutomationsStrings.cancelRun, role: .destructive) { Task { await controller.cancel(run) } } }
          Button(run.unread ? RemoteAutomationsStrings.markRead : RemoteAutomationsStrings.markUnread) { Task { await controller.mark(run, unread: !run.unread) } }
          Button(run.archived ? RemoteAutomationsStrings.restore : RemoteAutomationsStrings.archive) { Task { await controller.mark(run, archived: !run.archived) } }
        }.disabled(controller.busy)
      }
    }
    .navigationTitle(RemoteAutomationsStrings.result)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: run.id) {
      if run.unread, canOperate, let controller { await controller.mark(run, unread: false) }
      while !Task.isCancelled, currentRun.canCancel, let controller {
        do { try await Task.sleep(for: .seconds(2)) } catch { return }
        await controller.refreshRun(run)
      }
    }
  }
}
