import SwiftUI

struct RemoteIntegrationsSchedulesView: View {
  let selection: RemoteIntegrationsHostSelection?
  let projects: [RemoteIntegrationsProjectOption]
  let composition: RemoteIntegrationsComposition
  let isPresentationActive: Bool

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
  @State private var editor: RemoteIntegrationsScheduleEditorTarget?
  @State private var confirmation: RemoteIntegrationsScheduleConfirmation?

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
    .refreshable { await composition.schedules.load() }
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
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button(RemoteIntegrationsStrings.create, systemImage: "plus") {
          editor = .create
        }
        .disabled(mutationDisabled)
      }
    }
    .sheet(item: $editor) { target in
      RemoteIntegrationsScheduleEditor(
        target: target,
        projects: projects,
        controller: composition.schedules
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
    case .loaded where composition.schedules.schedules.isEmpty:
      ContentUnavailableView {
        Label(RemoteIntegrationsStrings.noSchedules, systemImage: "calendar.badge.plus")
      } description: {
        Text(RemoteIntegrationsStrings.noSchedulesDescription)
      } actions: {
        if !mutationDisabled {
          Button(RemoteIntegrationsStrings.create) { editor = .create }
            .remoteIntegrationsProminentButtonStyle()
        }
      }
    case .loaded:
      scheduleList
    }
  }

  private var scheduleList: some View {
    List {
      let filtered = composition.schedules.schedules.filter { statusFilter.matches($0) }
      if filtered.isEmpty {
        Section {
          Text(RemoteIntegrationsStrings.noMatchingSchedules)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
      } else {
        ForEach(filtered) { schedule in
          RemoteIntegrationsScheduleRow(schedule: schedule)
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
              Button(schedule.enabled
                ? RemoteIntegrationsStrings.pauseAction
                : RemoteIntegrationsStrings.resumeAction) {
                Task { await composition.schedules.perform(.update(id: schedule.id, task: schedule.input(enabled: !schedule.enabled))) }
              }
              .tint(.orange)
              Button(RemoteIntegrationsStrings.edit) { editor = .edit(schedule) }
                .tint(.accentColor)
            }
            .disabled(mutationDisabled)
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

struct RemoteIntegrationsScheduleRow: View {
  let schedule: RemoteIntegrationsScheduledTask

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
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
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
