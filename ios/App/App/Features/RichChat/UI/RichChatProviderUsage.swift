import SwiftUI

struct RichChatUsageRings: Equatable {
  let outerPercent: Double?
  let innerPercent: Double?
}

struct RichChatProviderUsagePresentation: Equatable {
  let providerID: String
  let label: String
  let snapshot: SettingsUsageSnapshot?

  var rings: RichChatUsageRings {
    let windows = snapshot?.windows ?? []
    let baseID = providerID.split(separator: ":", maxSplits: 1).first.map(String.init) ?? providerID

    func first(_ ids: [String]) -> Double? {
      ids.lazy.compactMap { id in windows.first { $0.id == id }?.usedPercent }.first
    }

    switch baseID {
    case "claude", "codex", "factory", "kimi", "qwen", "zai":
      return RichChatUsageRings(
        outerPercent: first(["session-5h"]),
        innerPercent: first(["weekly", "monthly", "weekly-opus", "weekly-sonnet", "weekly-fable"])
      )
    case "cursor":
      return RichChatUsageRings(
        outerPercent: first(["cursor-auto"]),
        innerPercent: first(["cursor-api"])
      )
    default:
      return RichChatUsageRings(
        outerPercent: windows.max(by: { $0.usedPercent < $1.usedPercent })?.usedPercent,
        innerPercent: nil
      )
    }
  }

  static func resolve(
    agentKind: String,
    agentInstanceID: String?,
    label: String?,
    usage: SettingsProviderUsage?
  ) -> RichChatProviderUsagePresentation {
    let snapshots = usage?.snapshots ?? []
    let availableIDs = Set(snapshots.map(\.providerId))
    let baseKind = agentKind.split(separator: ":", maxSplits: 1).first.map(String.init) ?? agentKind
    var candidates = [agentKind]
    if let agentInstanceID, !agentInstanceID.isEmpty {
      candidates.append("\(baseKind):\(agentInstanceID)")
    }
    let providerID =
      candidates.first(where: availableIDs.contains)
      ?? snapshots.first(where: {
        $0.providerId.split(separator: ":", maxSplits: 1).first.map(String.init) == baseKind
      })?.providerId
      ?? agentKind
    let resolvedLabel = label?.trimmingCharacters(in: .whitespacesAndNewlines)
    return RichChatProviderUsagePresentation(
      providerID: providerID,
      label: resolvedLabel.flatMap { $0.isEmpty ? nil : $0 } ?? baseKind.capitalized,
      snapshot: snapshots.first { $0.providerId == providerID }
    )
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
