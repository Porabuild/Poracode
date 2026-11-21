import SwiftUI

struct RichChatUsageRings: Equatable {
  let outerPercent: Double?
  let innerPercent: Double?
}

struct RichChatProviderUsagePresentation: Equatable {
  let providerID: String
  let label: String
  let snapshot: SettingsUsageSnapshot?
  var ringLayout: SettingsUsageRingLayout? = nil

  /// The desktop marks quota data stale after two minutes; retain its bars
  /// while offering Refresh instead of hiding the inspector section.
  func isStale(at now: Date = Date()) -> Bool {
    guard let snapshot else { return false }
    return now.timeIntervalSince1970 * 1_000 - Double(snapshot.fetchedAt) >= 120_000
  }

  var rings: RichChatUsageRings {
    let windows = snapshot?.windows ?? []
    // Older hosts omit presentation metadata. Keep the ring unknown rather
    // than guessing a different account or quota period; detail bars still work.
    let outer = ringLayout?.outerWindowId.flatMap { id in windows.first { $0.id == id } }
    let inner = ringLayout?.innerWindowId.flatMap { id in windows.first { $0.id == id } }
    return RichChatUsageRings(
      outerPercent: (outer ?? inner)?.usedPercent,
      innerPercent: outer == nil ? nil : inner?.usedPercent
    )
  }

  static func resolve(
    agentKind: String,
    agentInstanceID: String?,
    label: String?,
    usage: SettingsProviderUsage?
  ) -> RichChatProviderUsagePresentation {
    let snapshots = usage?.snapshots ?? []
    let baseKind = agentKind.split(separator: ":", maxSplits: 1).first.map(String.init) ?? agentKind
    let providerID = agentInstanceID.flatMap { $0.isEmpty ? nil : "\(baseKind):\($0)" } ?? agentKind
    let resolvedLabel = label?.trimmingCharacters(in: .whitespacesAndNewlines)
    return RichChatProviderUsagePresentation(
      providerID: providerID,
      label: resolvedLabel.flatMap { $0.isEmpty ? nil : $0 } ?? baseKind.capitalized,
      snapshot: snapshots.first { $0.providerId == providerID },
      ringLayout: usage?.ringLayouts?[providerID]
    )
  }
}

struct RichChatProviderUsageCard: View {
  let presentation: RichChatProviderUsagePresentation
  let state: SettingsLoadState
  var refresh: (@MainActor () async -> Void)? = nil
  @State private var isRefreshing = false

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      VStack(alignment: .leading, spacing: 8) {
        if let snapshot = presentation.snapshot {
          ForEach(snapshot.windows, id: \.id) { window in
            SettingsUsageWindowMeter(window: window)
          }
          if snapshot.windows.isEmpty && snapshot.status == .ok {
            Text(SettingsUIStrings.noData).foregroundStyle(.secondary)
          }
          if snapshot.status != .ok {
            Text(SettingsUsagePresentation.statusLabel(snapshot.status)).foregroundStyle(.secondary)
          }
          if presentation.isStale(at: context.date) {
            Text(RichChatStrings.usageStale).foregroundStyle(.secondary)
          }
        } else if state == .loading || state == .idle || isRefreshing {
          ProgressView(SettingsUIStrings.loading)
        } else if case .failed(let failure) = state {
          Text(SettingsUIStrings.failure(failure)).foregroundStyle(.secondary)
        } else {
          Text(SettingsUIStrings.noProvidersTracked).foregroundStyle(.secondary)
        }
        if refresh != nil {
          Button(SettingsUIStrings.refresh, systemImage: "arrow.clockwise", action: refreshNow)
            .poracodeGlassButtonStyle()
            .disabled(isRefreshing)
        }
      }
      .poracodeChatText(.metadata)
      .padding(12)
    }
  }

  private func refreshNow() {
    guard !isRefreshing, let refresh else { return }
    isRefreshing = true
    Task { await refresh(); isRefreshing = false }
  }
}

struct RichChatProviderUsageSheet: View {
  @Bindable var session: AppSession
  let presentation: RichChatProviderUsagePresentation
  let state: SettingsLoadState
  let refresh: @MainActor () async -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var isRefreshing = false

  var body: some View {
    NavigationStack {
      List {
        content
        Section {
          NavigationLink {
            SettingsMoreRouteView(session: session, route: .usage)
          } label: {
            Label(SettingsUIStrings.usageTitle, systemImage: "arrow.up.forward.app")
          }
        }
      }
      .listStyle(.insetGrouped)
      .navigationTitle(presentation.label)
      .navigationBarTitleDisplayMode(.inline)
      .refreshable { await refresh() }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(RichChatStrings.cancel) { dismiss() }
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button(SettingsUIStrings.refresh, systemImage: "arrow.clockwise") {
            refreshNow()
          }
          .disabled(isRefreshing)
        }
      }
    }
    .presentationDetents([.medium, .large])
  }

  @ViewBuilder
  private var content: some View {
    if let snapshot = presentation.snapshot {
      Section(SettingsUIStrings.usageTitle) {
        if snapshot.status == .ok, !snapshot.windows.isEmpty {
          ForEach(snapshot.windows, id: \.id) { window in
            SettingsUsageWindowMeter(window: window)
          }
        } else {
          Label(
            SettingsUsagePresentation.statusLabel(snapshot.status),
            systemImage: "gauge.with.dots.needle.67percent"
          )
          .foregroundStyle(.secondary)
        }
      }
    } else if state == .loading || state == .idle {
      Section {
        HStack {
          ProgressView()
          Text(SettingsUIStrings.loading)
        }
      }
    } else {
      Section {
        Label(
          SettingsUIStrings.noProvidersTracked,
          systemImage: "gauge.open.with.lines.needle.33percent"
        )
        .foregroundStyle(.secondary)
      }
    }
  }

  private func refreshNow() {
    guard !isRefreshing else { return }
    isRefreshing = true
    Task {
      await refresh()
      isRefreshing = false
    }
  }
}
