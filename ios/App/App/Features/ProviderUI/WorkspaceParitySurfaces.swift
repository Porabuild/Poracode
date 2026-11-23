import Foundation
import SwiftUI

// MARK: - Media Lease Client (`file-media-*` & `environment-media-*`)

enum EditorMediaLeaseWire {
  static let routeIds: [String] = [
    "file-media-ticket",
    "file-media",
    "file-media-release",
    "file-media-renew",
    "environment-media-ticket",
    "environment-media-release",
    "environment-media-renew",
  ]

  static func mintFileMediaTicket(path: String, projectLocation: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: ["path": path, "projectLocation": projectLocation])
    let data = try await api.requestData(path: "/api/files/media/ticket", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func renewFileMediaTicket(ticket: String, api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: ["ticket": ticket])
    let data = try await api.requestData(path: "/api/files/media/renew", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func releaseFileMediaTicket(ticket: String, api: RemoteAPIClient) async throws {
    let body = try JSONSerialization.data(withJSONObject: ["ticket": ticket])
    _ = try await api.requestData(path: "/api/files/media/release", method: "POST", jsonBody: body)
  }

  static func mintEnvironmentMediaTicket(environmentId: String, path: String, api: RemoteAPIClient) async throws -> [String: Any] {
    let encoded = environmentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? environmentId
    let body = try JSONSerialization.data(withJSONObject: ["path": path])
    let data = try await api.requestData(path: "/api/environments/\(encoded)/media/ticket", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func renewEnvironmentMediaTicket(environmentId: String, ticket: String, api: RemoteAPIClient) async throws -> [String: Any] {
    let encoded = environmentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? environmentId
    let body = try JSONSerialization.data(withJSONObject: ["ticket": ticket])
    let data = try await api.requestData(path: "/api/environments/\(encoded)/media/renew", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }

  static func releaseEnvironmentMediaTicket(environmentId: String, ticket: String, api: RemoteAPIClient) async throws {
    let encoded = environmentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? environmentId
    let body = try JSONSerialization.data(withJSONObject: ["ticket": ticket])
    _ = try await api.requestData(path: "/api/environments/\(encoded)/media/release", method: "POST", jsonBody: body)
  }
}

// MARK: - Rich File Editor Helpers: Merge Conflicts, Find/Replace, Multi-Tab Bar

struct MergeConflictHunk: Identifiable, Equatable {
  let id: Int
  let range: Range<String.Index>
  let currentLabel: String
  let currentText: String
  let incomingLabel: String
  let incomingText: String
}

enum MergeConflictResolver {
  enum Choice { case current, incoming, both }

  static func findHunks(in source: String) -> [MergeConflictHunk] {
    var hunks: [MergeConflictHunk] = []
    var cursor = source.startIndex
    var idx = 0
    while cursor < source.endIndex {
      guard let start = source.range(of: "<<<<<<<", range: cursor..<source.endIndex),
        let mid = source.range(of: "\n=======\n", range: start.upperBound..<source.endIndex),
        let endMarker = source.range(of: "\n>>>>>>>", range: mid.upperBound..<source.endIndex)
      else { break }
      let lineEnd = source[endMarker.upperBound...].firstIndex(of: "\n") ?? source.endIndex
      let firstNewline = source[start.upperBound..<mid.lowerBound].firstIndex(of: "\n") ?? mid.lowerBound
      let currentLabel = String(source[start.upperBound..<firstNewline]).trimmingCharacters(in: .whitespaces)
      let currentBodyStart = firstNewline < mid.lowerBound ? source.index(after: firstNewline) : mid.lowerBound
      let currentText = String(source[currentBodyStart..<mid.lowerBound])
      let incomingText = String(source[mid.upperBound..<endMarker.lowerBound])
      let incomingLabel = String(source[endMarker.upperBound..<lineEnd]).trimmingCharacters(in: .whitespaces)
      let fullEnd = lineEnd < source.endIndex ? source.index(after: lineEnd) : lineEnd
      hunks.append(MergeConflictHunk(
        id: idx,
        range: start.lowerBound..<fullEnd,
        currentLabel: currentLabel,
        currentText: currentText,
        incomingLabel: incomingLabel,
        incomingText: incomingText
      ))
      idx += 1
      cursor = fullEnd
    }
    return hunks
  }

  static func resolve(in source: String, hunk: MergeConflictHunk, choice: Choice) -> String {
    let replacement: String
    switch choice {
    case .current: replacement = hunk.currentText + "\n"
    case .incoming: replacement = hunk.incomingText + "\n"
    case .both: replacement = hunk.currentText + "\n" + hunk.incomingText + "\n"
    }
    var copy = source
    copy.replaceSubrange(hunk.range, with: replacement)
    return copy
  }
}

struct EditorMultiTabStrip: View {
  let openPaths: [String]
  let activePath: String?
  let dirtyPaths: Set<String>
  let onSelect: (String) -> Void
  let onClose: (String) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(openPaths, id: \.self) { path in
          let active = path == activePath
          let name = (path as NSString).lastPathComponent
          HStack(spacing: 4) {
            Button { onSelect(path) } label: {
              Text(dirtyPaths.contains(path) ? "• \(name)" : name)
                .font(.caption.weight(active ? .semibold : .regular))
                .lineLimit(1)
            }
            .buttonStyle(.plain)
            Button { onClose(path) } label: {
              Image(systemName: "xmark").font(.system(size: 10, weight: .semibold))
            }
            .buttonStyle(.plain)
          }
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(
            active ? Color.accentColor.opacity(0.16) : Color(.secondarySystemBackground),
            in: Capsule()
          )
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 6)
    }
  }
}

struct EditorFindReplaceBar: View {
  @Binding var query: String
  @Binding var replacement: String
  let matchCount: Int
  let onReplaceAll: () -> Void
  let onClose: () -> Void

  var body: some View {
    VStack(spacing: 6) {
      HStack(spacing: 8) {
        TextField("Find…", text: $query).textFieldStyle(.roundedBorder).font(.caption)
        Text("\(matchCount)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
        Button { onClose() } label: { Image(systemName: "xmark") }.buttonStyle(.borderless)
      }
      HStack(spacing: 8) {
        TextField("Replace…", text: $replacement).textFieldStyle(.roundedBorder).font(.caption)
        Button("Replace all", action: onReplaceAll)
          .font(.caption.weight(.medium))
          .buttonStyle(.bordered)
          .disabled(query.isEmpty || matchCount == 0)
      }
    }
    .padding(10)
    .background(Color(.secondarySystemBackground))
  }
}

// MARK: - Scoped PR/Forge Operations & PR Ask-AI Chat

enum ScopedForgeReviewWire {
  static let prWatchScopedUpsertRouteId = "pr-watch-scoped-upsert"

  static func listPullRequestsInState(
    projectLocation: [String: Any],
    state: String,
    api: RemoteAPIClient
  ) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(
      procedure: "forgeListPullRequestsInState",
      payload: ["projectLocation": projectLocation, "state": state],
      api: api
    )
  }

  static func getPrCommitDiff(
    projectLocation: [String: Any],
    prNumber: Int,
    commitSha: String,
    api: RemoteAPIClient
  ) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(
      procedure: "forgeGetPrCommitDiff",
      payload: ["projectLocation": projectLocation, "number": prNumber, "sha": commitSha],
      api: api
    )
  }

  static func setPrReaction(
    projectLocation: [String: Any],
    commentId: String,
    reaction: String,
    active: Bool,
    api: RemoteAPIClient
  ) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(
      procedure: "forgeSetPrReaction",
      payload: [
        "projectLocation": projectLocation,
        "commentId": commentId,
        "reaction": reaction,
        "active": active,
      ],
      api: api
    )
  }

  static func submitPrReviewDraft(
    projectLocation: [String: Any],
    prNumber: Int,
    event: String,
    bodyText: String,
    comments: [[String: Any]],
    api: RemoteAPIClient
  ) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(
      procedure: "forgeSubmitPrReviewDraft",
      payload: [
        "projectLocation": projectLocation,
        "number": prNumber,
        "event": event,
        "body": bodyText,
        "comments": comments,
      ],
      api: api
    )
  }

  static func pollPullRequests(projectLocation: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    try await HostAgentRegistryWire.call(
      procedure: "ghPollPullRequests",
      payload: ["projectLocation": projectLocation],
      api: api
    )
  }

  static func upsertScopedPrWatch(payload: [String: Any], api: RemoteAPIClient) async throws -> [String: Any] {
    let body = try JSONSerialization.data(withJSONObject: payload)
    let data = try await api.requestData(path: "/api/pr-watch/scoped", method: "POST", jsonBody: body)
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
  }
}

struct PullRequestAskAiSheet: View {
  let prTitle: String
  let prNumber: Int
  let onAsk: (String) async -> String?
  @Environment(\.dismiss) private var dismiss
  @State private var prompt = ""
  @State private var messages: [(isUser: Bool, text: String)] = []
  @State private var sending = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        List(Array(messages.enumerated()), id: \.offset) { _, msg in
          HStack {
            if msg.isUser { Spacer() }
            Text(msg.text)
              .font(.footnote)
              .padding(10)
              .background(
                msg.isUser ? Color.accentColor.opacity(0.16) : Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 10)
              )
            if !msg.isUser { Spacer() }
          }
          .listRowSeparator(.hidden)
        }
        .listStyle(.plain)
        HStack(spacing: 8) {
          TextField("Ask about PR #\(prNumber)…", text: $prompt)
            .textFieldStyle(.roundedBorder)
          Button("Ask") {
            let question = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !question.isEmpty, !sending else { return }
            prompt = ""
            messages.append((true, question))
            sending = true
            Task {
              let answer = await onAsk(question) ?? "Unable to answer right now."
              messages.append((false, answer))
              sending = false
            }
          }
          .buttonStyle(.borderedProminent)
          .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending)
        }
        .padding(12)
      }
      .navigationTitle("Ask AI · #\(prNumber)")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
      }
    }
  }
}

// MARK: - Git AI Ergonomics & Multi-Tab Terminal Strip

struct GitReviewAiActionBar: View {
  let hasConflicts: Bool
  let busy: Bool
  let onGenerateCommitMessage: () -> Void
  let onCommitAndPush: () -> Void
  let onCommitPushAndPr: () -> Void
  let onFixConflictsInAgent: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      HStack(spacing: 8) {
        Button("AI Commit Msg", systemImage: "sparkles", action: onGenerateCommitMessage)
          .buttonStyle(.bordered)
          .disabled(busy)
        Button("Commit & Push", action: onCommitAndPush)
          .buttonStyle(.bordered)
          .disabled(busy)
        Button("Commit + PR", action: onCommitPushAndPr)
          .buttonStyle(.borderedProminent)
          .disabled(busy)
      }
      if hasConflicts {
        Button("Fix conflicts in Agent", systemImage: "sparkles", action: onFixConflictsInAgent)
          .buttonStyle(.borderedProminent)
          .frame(maxWidth: .infinity)
          .disabled(busy)
      }
    }
    .font(.caption.weight(.medium))
  }
}

struct TerminalTabDescriptor: Identifiable, Equatable {
  let id: String
  let title: String
  let isRunning: Bool
  let isRunAction: Bool
}

struct TerminalMultiTabBar: View {
  let tabs: [TerminalTabDescriptor]
  let activeTabId: String
  @Binding var directKeyMode: Bool
  let onSelect: (String) -> Void
  let onClose: (String) -> Void
  let onAdd: () -> Void

  var body: some View {
    HStack(spacing: 6) {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 6) {
          ForEach(tabs) { tab in
            let active = tab.id == activeTabId
            HStack(spacing: 5) {
              Circle()
                .fill(tab.isRunning ? Color.green : Color.secondary.opacity(0.4))
                .frame(width: 7, height: 7)
              Button(tab.title) { onSelect(tab.id) }
                .font(.caption.weight(active ? .semibold : .regular))
                .buttonStyle(.plain)
              if tabs.count > 1 {
                Button { onClose(tab.id) } label: {
                  Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                }
                .buttonStyle(.plain)
              }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(active ? Color.accentColor.opacity(0.18) : Color(.secondarySystemBackground), in: Capsule())
          }
        }
      }
      Button { onAdd() } label: { Image(systemName: "plus") }
        .buttonStyle(.bordered)
        .controlSize(.small)
      Toggle("Raw", isOn: $directKeyMode)
        .toggleStyle(.button)
        .controlSize(.small)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
  }
}
