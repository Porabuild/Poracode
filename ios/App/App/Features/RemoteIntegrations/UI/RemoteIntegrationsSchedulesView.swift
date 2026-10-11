import SwiftUI

struct RemoteIntegrationsSchedulesView: View {
  @Bindable var session: AppSession
  let selection: RemoteIntegrationsHostSelection?
  let projects: [RemoteIntegrationsProjectOption]
  let agents: [AgentStatusRecord]
  let composition: RemoteIntegrationsComposition
  let isPresentationActive: Bool
  let createWithAgent: (() -> Void)?

  enum StatusFilter: String, CaseIterable, Identifiable {
    case all
    case active
    case paused

    var id: Self { self }

    var title: String {
      switch self {
      case .all: RemoteIntegrationsStrings.filterAll
      case .active: RemoteIntegrationsStrings.filterActive
      case .paused: RemoteIntegrationsStrings.filterPaused
      }
    }

    func matches(_ schedule: RemoteIntegrationsScheduledTask) -> Bool {
      switch self {
      case .all: true
      case .active: schedule.enabled
      case .paused: !schedule.enabled
      }
    }
  }

  @State private var statusFilter: StatusFilter = .all
  @State private var query = ""
  @State private var editor: RemoteIntegrationsScheduleEditorTarget?
  @State private var confirmation: RemoteIntegrationsScheduleConfirmation?
  @State private var runsSchedule: RemoteIntegrationsScheduledTask?

  var body: some View {
    Group {
      if let failure = composition.gate(.sessionRead) {
        RemoteIntegrationsUnavailableView(failure: failure)
      } else {
        content
      }
    }
    .navigationTitle(RemoteIntegrationsStrings.schedules)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: loadIdentity) {
      guard isPresentationActive else { return }
      composition.activate(selection)
      await composition.schedules.load()
    }
    .task(id: pollingIdentity) {
      guard pollingIdentity.shouldPoll else { return }
      while !Task.isCancelled, hasRunningSchedule {
        do {
          try await Task.sleep(for: .seconds(2))
        } catch {
          return
        }
        guard pollingIdentity.shouldPoll else { return }
        await composition.schedules.load()
      }
    }
    .refreshable { await composition.schedules.load() }
    .searchable(text: $query, prompt: RemoteIntegrationsStrings.searchSchedules)
    .safeAreaInset(edge: .top, spacing: 0) {
      Picker(RemoteIntegrationsStrings.schedules, selection: $statusFilter) {
        ForEach(StatusFilter.allCases) { value in
          Text(value.title).tag(value)
        }
      }
      .pickerStyle(.segmented)
      .padding(.horizontal)
      .padding(.vertical, 8)
      .background(.bar)
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      PoracodeBottomActionDock(placement: .trailing) {
        PoracodeCircleMenu {
          if let createWithAgent {
            Button(RemoteIntegrationsStrings.createWithAgent, systemImage: "sparkles") {
              createWithAgent()
            }
          }
          Button(RemoteIntegrationsStrings.createSchedule, systemImage: "calendar.badge.plus") {
            editor = .create
          }
        } label: {
          Label(RemoteIntegrationsStrings.create, systemImage: "plus")
            .labelStyle(.iconOnly)
        }
        .disabled(mutationDisabled || agents.isEmpty)
        .accessibilityIdentifier("native-e2e.schedules.create")
      }
    }
    .sheet(item: $editor) { target in
      RemoteIntegrationsScheduleEditor(
        target: target,
        projects: projects,
        agents: agents,
        controller: composition.schedules
      )
    }
    .sheet(item: $runsSchedule) { schedule in
      RemoteIntegrationsScheduleRunsView(
        session: session,
        schedule: schedule,
        controller: composition.scheduleRuns
      )
    }
    .alert(item: $confirmation) { confirmation in
      alert(confirmation)
    }
    .overlay(alignment: .bottom) {
      RemoteIntegrationsMutationBanner(
        notice: composition.schedules.notice,
        failure: composition.schedules.mutationFailure,
        dismiss: composition.schedules.clearFeedback
      )
      .padding()
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
    switch composition.schedules.state {
    case .idle, .loading:
      RemoteIntegrationsLoadingView()
    case .failed(let failure):
      RemoteIntegrationsUnavailableView(failure: failure) {
        Task { await composition.schedules.load() }
      }
    case .loaded:
      scheduleList
    }
  }

  private var scheduleList: some View {
    List {
      let filtered = composition.schedules.schedules.filter {
        RemoteIntegrationsScheduleListFilter.matches(
          $0,
          status: statusFilter,
          query: query
        )
      }
      if composition.schedules.schedules.isEmpty {
        Section {
          ContentUnavailableView {
            Label(RemoteIntegrationsStrings.noSchedules, systemImage: "calendar.badge.plus")
          } description: {
            Text(RemoteIntegrationsStrings.noSchedulesDescription)
          }
        }
      } else if filtered.isEmpty {
        Section {
          Text(RemoteIntegrationsStrings.noMatchingSchedules)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
      } else {
        ForEach(filtered) { schedule in
          RemoteIntegrationsScheduleRow(
            schedule: schedule,
            showRuns: { runsSchedule = schedule }
          )
          .contentShape(Rectangle())
          .onTapGesture {
            guard !mutationDisabled else { return }
            editor = .edit(schedule)
          }
          .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(RemoteIntegrationsStrings.delete, role: .destructive) {
              confirmation = .delete(schedule)
            }
            Button(RemoteIntegrationsStrings.runNow) {
              confirmation = .run(schedule)
            }
            .tint(.accentColor)
          }
          .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button(
              schedule.enabled
                ? RemoteIntegrationsStrings.pauseAction
                : RemoteIntegrationsStrings.resumeAction
            ) {
              Task {
                await composition.schedules.perform(
                  .update(id: schedule.id, task: schedule.input(enabled: !schedule.enabled)))
              }
            }
            .tint(.orange)
            Button(RemoteIntegrationsStrings.edit) { editor = .edit(schedule) }
              .tint(.accentColor)
          }
          .disabled(mutationDisabled)
        }
      }

      if !availablePresets.isEmpty {
        Section(RemoteIntegrationsStrings.suggestions) {
          ForEach(availablePresets) { preset in
            Button {
              create(preset)
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "calendar.badge.plus")
                  .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 3) {
                  Text(preset.title)
                    .foregroundStyle(.primary)
                  Text(RemoteIntegrationsPresentation.recurrence(preset.recurrence))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "plus")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(.secondary)
              }
            }
            .disabled(mutationDisabled)
          }
        }
      }
      if composition.gate(.sessionOperate) != nil {
        Section { RemoteIntegrationsReadOnlyNotice() }
      }
    }
    .listStyle(.insetGrouped)
  }

  private var mutationDisabled: Bool {
    composition.gate(.sessionOperate) != nil || composition.schedules.isMutating
  }

  private var hasRunningSchedule: Bool {
    composition.schedules.schedules.contains { $0.lastStatus == .running }
  }

  private var pollingIdentity: RemoteIntegrationsSchedulePollingIdentity {
    RemoteIntegrationsSchedulePollingIdentity(
      lease: selection?.lease,
      isPresentationActive: isPresentationActive,
      hasRunningSchedule: hasRunningSchedule,
      isMutating: composition.schedules.isMutating
    )
  }

  private var availablePresets: [RemoteIntegrationsSchedulePreset] {
    guard let agent = agents.first,
      let configuration = RemoteIntegrationsScheduleAgentCatalog.defaultConfiguration(for: agent)
    else { return [] }
    let existingNames = Set(composition.schedules.schedules.map(\.name))
    return [
      RemoteIntegrationsSchedulePreset(
        id: "daily-brief",
        title: RemoteIntegrationsStrings.dailyBrief,
        prompt: RemoteIntegrationsStrings.dailyBriefPrompt,
        recurrence: .weekly(days: [1, 2, 3, 4, 5], time: "08:00")
      ),
      RemoteIntegrationsSchedulePreset(
        id: "weekly-review",
        title: RemoteIntegrationsStrings.weeklyReview,
        prompt: RemoteIntegrationsStrings.weeklyReviewPrompt,
        recurrence: .weekly(days: [5], time: "16:00")
      ),
      RemoteIntegrationsSchedulePreset(
        id: "keep-on-track",
        title: RemoteIntegrationsStrings.keepOnTrack,
        prompt: RemoteIntegrationsStrings.keepOnTrackPrompt,
        recurrence: .weekly(days: [0, 1, 2, 3, 4, 5, 6], time: "13:00")
      ),
    ].filter { !existingNames.contains($0.title) }
      .map { $0.with(agentKind: agent.kind, configuration: configuration) }
  }

  private func create(_ preset: RemoteIntegrationsSchedulePreset) {
    guard let task = preset.task else { return }
    Task { await composition.schedules.perform(.create(task)) }
  }

  private func alert(_ confirmation: RemoteIntegrationsScheduleConfirmation) -> Alert {
    switch confirmation {
    case .run(let schedule):
      Alert(
        title: Text(RemoteIntegrationsStrings.confirmRunSchedule),
        primaryButton: .default(Text(RemoteIntegrationsStrings.runNow)) {
          Task { await composition.schedules.perform(.run(id: schedule.id)) }
        },
        secondaryButton: .cancel(Text(RemoteIntegrationsStrings.cancel))
      )
    case .delete(let schedule):
      Alert(
        title: Text(RemoteIntegrationsStrings.confirmDeleteSchedule),
        message: Text(RemoteIntegrationsStrings.deleteScheduleMessage),
        primaryButton: .destructive(Text(RemoteIntegrationsStrings.delete)) {
          Task { await composition.schedules.perform(.delete(id: schedule.id)) }
        },
        secondaryButton: .cancel(Text(RemoteIntegrationsStrings.cancel))
      )
    }
  }
}

enum RemoteIntegrationsScheduleListFilter {
  static func matches(
    _ schedule: RemoteIntegrationsScheduledTask,
    status: RemoteIntegrationsSchedulesView.StatusFilter,
    query: String
  ) -> Bool {
    guard status.matches(schedule) else { return false }
    let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized.isEmpty
      || schedule.name.localizedCaseInsensitiveContains(normalized)
      || schedule.prompt.localizedCaseInsensitiveContains(normalized)
  }
}

struct RemoteIntegrationsSchedulePollingIdentity: Hashable {
  let lease: RemoteIntegrationsHostLease?
  let isPresentationActive: Bool
  let hasRunningSchedule: Bool
  let isMutating: Bool

  var shouldPoll: Bool {
    lease != nil && isPresentationActive && hasRunningSchedule && !isMutating
  }
}

struct RemoteIntegrationsSchedulePreset: Identifiable, Equatable {
  let id: String
  let title: String
  let prompt: String
  let recurrence: RemoteIntegrationsScheduleRecurrence
  var agentKind: String? = nil
  var configuration: RemoteIntegrationsAgentConfig? = nil

  func with(
    agentKind: String,
    configuration: RemoteIntegrationsAgentConfig
  ) -> RemoteIntegrationsSchedulePreset {
    var value = self
    value.agentKind = agentKind
    value.configuration = configuration
    return value
  }

  var task: RemoteIntegrationsScheduledTaskInput? {
    guard let agentKind, let configuration else { return nil }
    return RemoteIntegrationsScheduledTaskInput(
      name: title,
      prompt: prompt,
      agentKind: agentKind,
      config: configuration,
      recurrence: recurrence,
      enabled: true,
      projectId: nil
    )
  }
}

struct RemoteIntegrationsScheduleRow: View {
  let schedule: RemoteIntegrationsScheduledTask
  let showRuns: () -> Void

  private var statusCaption: String {
    if schedule.lastStatus == .running { return RemoteIntegrationsStrings.runningNowCaption }
    if !schedule.enabled { return RemoteIntegrationsStrings.pausedCaption }
    if let nextRunAt = schedule.nextRunAt {
      return RemoteIntegrationsStrings.nextRunCaption(nextRunAt)
    }
    return RemoteIntegrationsPresentation.scheduleStatus(schedule.lastStatus)
  }

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: schedule.enabled ? "calendar.badge.clock" : "calendar.badge.minus")
        .foregroundStyle(iconColor)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(schedule.name)
          .font(.body.weight(.medium))
        Text(RemoteIntegrationsPresentation.recurrence(schedule.recurrence))
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(statusCaption)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      Spacer()
      Button(action: showRuns) {
        Image(systemName: "clock.arrow.circlepath")
          .frame(width: 32, height: 32)
      }
      .buttonStyle(.plain)
      .foregroundStyle(.secondary)
      .accessibilityLabel(RemoteIntegrationsStrings.previousRuns)
    }
    .padding(.vertical, 2)
  }

  private var iconColor: Color {
    if schedule.lastStatus == .failed { return .red }
    if schedule.lastStatus == .running { return .accentColor }
    return schedule.enabled ? .accentColor : .secondary
  }
}

enum RemoteIntegrationsScheduleEditorTarget: Identifiable {
  case create
  case edit(RemoteIntegrationsScheduledTask)

  var id: String {
    switch self {
    case .create: "create"
    case .edit(let task): task.id
    }
  }
}

enum RemoteIntegrationsScheduleConfirmation: Identifiable {
  case run(RemoteIntegrationsScheduledTask)
  case delete(RemoteIntegrationsScheduledTask)

  var id: String {
    switch self {
    case .run(let task): "run:\(task.id)"
    case .delete(let task): "delete:\(task.id)"
    }
  }
}
