import SwiftUI

@MainActor @Observable
final class PullRequestGuideDraft {
  var writer = ""
  var model = ""
  var instructions = ""
  private var target: ForgeReviewTarget?
  private var fingerprint: String?
  private var stopIndex = 0

  func synchronize(target: ForgeReviewTarget, fingerprint: String?) {
    if self.target != target {
      self.target = target
      self.fingerprint = nil
      stopIndex = 0
      writer = ""
      model = ""
      instructions = ""
    }
    if let fingerprint, self.fingerprint != fingerprint {
      self.fingerprint = fingerprint
      stopIndex = 0
    }
  }

  func index(for count: Int) -> Int {
    min(stopIndex, max(0, count - 1))
  }

  func move(by offset: Int, count: Int) {
    stopIndex = max(0, min(index(for: count) + offset, max(0, count - 1)))
  }
}

struct PullRequestGuideView: View {
  @Bindable var forge: ForgeReviewController
  let target: ForgeReviewTarget
  @Bindable var draft: PullRequestGuideDraft
  let writers: [AgentStatusRecord]
  let finish: () -> Void

  private var document: GitHubDocument? {
    forge.reviewTarget == target ? forge.documents[.forgeGetPrReviewGuide] : nil
  }
  private var guide: [String: GitHubJSONValue]? { document?["guide"]?.objectValue }
  private var stops: [[String: GitHubJSONValue]] { guide?["stops"]?.arrayValue?.compactMap(\.objectValue) ?? [] }
  private var index: Int { draft.index(for: stops.count) }
  private var isGenerating: Bool { document?["status"]?.stringValue == "generating" }
  private var stale: Bool { document?["stale"]?.boolValue != false || document.map { !forge.matchesDisplayedDiff($0) } != false }
  private var writerKinds: [String] { Array(Set(writers.map(\.kind))).sorted() }
  private var selectedWriter: String {
    writerKinds.contains(draft.writer) ? draft.writer : writerKinds.first ?? ""
  }
  private var fingerprint: String? { guide?["fingerprint"]?.stringValue }
  private var canWrite: Bool {
    forge.reviewTarget == target && forge.canMutate && !selectedWriter.isEmpty
      && !isGenerating && draft.instructions.utf16.count <= 16_000
  }
  private var canFinish: Bool {
    forge.reviewTarget == target && forge.canMutate
      && forge.capabilities["reviewDecisions"]?.arrayValue?.isEmpty == false
  }

  var body: some View {
    List {
      Section {
        Picker(PullRequestsStrings.guideText("Guide writer"), selection: Binding(get: { selectedWriter }, set: { draft.writer = $0 })) {
          ForEach(writerKinds, id: \.self) { kind in
            Text(writers.first { $0.kind == kind }?.label ?? kind).tag(kind)
          }
        }
        TextField(PullRequestsStrings.guideText("Guide model"), text: $draft.model)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        TextField(PullRequestsStrings.guideText("Review guide instructions"), text: $draft.instructions, axis: .vertical)
          .lineLimit(2...6)
          .accessibilityIdentifier("native-e2e.pull-requests.guide.instructions")
        Button(PullRequestsStrings.guideText(guide == nil ? "Write guide" : "Rewrite guide")) {
          writeGuide()
        }
        .disabled(!canWrite)
        .accessibilityIdentifier("native-e2e.pull-requests.guide.write")
        if selectedWriter.isEmpty {
          Text(PullRequestsStrings.guideText("Select a guide writer that supports an enforced read-only workspace."))
            .foregroundStyle(.secondary)
        }
      }
      .disabled(forge.mutating || isGenerating)

      if isGenerating {
        Section {
          ProgressView()
          Text(PullRequestsStrings.guideText("Writing guide. You can leave this review and return when it is ready."))
        }
      }
      if document?["status"]?.stringValue == "failed" {
        Text(PullRequestsStrings.guideText("Could not write the guide. Try rewriting it."))
          .foregroundStyle(.red)
      }
      if let summary = guide?["summary"]?.stringValue {
        Section {
          if stale {
            Text(PullRequestsStrings.guideText("This guide is out of date. Rewrite it to see excerpts for the current change."))
              .foregroundStyle(.secondary)
          }
          Text(summary).textSelection(.enabled)
        }
      }
      if !stops.isEmpty {
        let stop = stops[index]
        Section(stop["title"]?.stringValue ?? "") {
          if stop["lookClosely"]?.boolValue == true {
            Label(PullRequestsStrings.guideText("Look closely"), systemImage: "exclamationmark.circle")
          }
          Text(stop["body"]?.stringValue ?? "").textSelection(.enabled)
          ForEach(stop["files"]?.arrayValue?.compactMap(\.stringValue) ?? [], id: \.self) { path in
            NavigationLink(path) {
              PullRequestDiffView(path: path, diff: PullRequestUnifiedDiff.chunk(for: path, in: forge.documents[.forgeGetPrDiff]?["diff"]?.stringValue ?? ""))
            }
          }
          if !stale {
            ForEach(Array((stop["excerpts"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, value in
              if let excerpt = value.objectValue {
                VStack(alignment: .leading, spacing: 6) {
                  Text("\(excerpt["path"]?.stringValue ?? ""):\(excerpt["startLine"]?.integerValue ?? 0)–\(excerpt["endLine"]?.integerValue ?? 0)")
                    .font(.caption.monospaced())
                  Text(excerpt["text"]?.stringValue ?? "").font(.caption.monospaced()).textSelection(.enabled)
                }
              }
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .toolbar {
      if !stops.isEmpty {
        ToolbarItemGroup(placement: .bottomBar) {
          Button(PullRequestsStrings.guideText("Back"), systemImage: "chevron.left") {
            draft.move(by: -1, count: stops.count)
          }
          .disabled(index == 0)
          .accessibilityIdentifier("native-e2e.pull-requests.guide.back")
          if index < stops.count - 1 {
            Button(PullRequestsStrings.guideText("Next"), systemImage: "chevron.right") {
              draft.move(by: 1, count: stops.count)
            }
            .accessibilityIdentifier("native-e2e.pull-requests.guide.next")
          } else {
            Button(PullRequestsStrings.guideText("Finish review"), systemImage: "checkmark.bubble") {
              if canFinish { finish() }
            }
            .disabled(!canFinish)
            .accessibilityIdentifier("native-e2e.pull-requests.guide.finish")
          }
        }
      }
    }
    .scrollDismissesKeyboard(.interactively)
    .onChange(of: target, initial: true) { _, target in
      draft.synchronize(target: target, fingerprint: fingerprint)
    }
    .onChange(of: fingerprint, initial: true) { _, fingerprint in
      draft.synchronize(target: target, fingerprint: fingerprint)
    }
    .task(id: isGenerating && !forge.isCached ? target : nil) {
      while isGenerating && !forge.isCached && !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(5)) } catch { return }
        await forge.refreshGuide(expectedTarget: target)
      }
    }
  }

  private func writeGuide() {
    guard canWrite else { return }
    var fields: [String: GitHubJSONValue] = [
      "agentKind": .string(selectedWriter),
      "instructions": .string(draft.instructions),
      "language": .string(Locale.current.localizedString(
        forLanguageCode: Locale.current.language.languageCode?.identifier ?? "en"
      ) ?? "English"),
    ]
    let model = draft.model.trimmingCharacters(in: .whitespacesAndNewlines)
    if !model.isEmpty { fields["selection"] = .object(["model": .string(model)]) }
    Task { await forge.mutate(.forgeWritePrReviewGuide, fields: fields, expectedTarget: target) }
  }

}

extension PullRequestGuideView {
  /// Installed, signed-in agents in the workspace's environment that declare an enforced
  /// read-only workspace, the only writers admitted for review guides.
  static func writers(from replay: HostReplayState, location: ProjectLocation) -> [AgentStatusRecord] {
    let statuses: [AgentStatusRecord]
    switch location {
    case .wsl(let distro, _, _, _):
      statuses = replay.wslAgentStatuses.filter { $0.envDistro == distro }
    case .windows:
      statuses = replay.agentStatuses.ordered.filter { $0.envKind == .windows || $0.envKind == nil }
    case .posix:
      statuses = replay.agentStatuses.ordered.filter { $0.envKind == .posix || $0.envKind == nil }
    }
    return statuses.filter { $0.installed && $0.authState != .missing && $0.capabilities["supportsReadOnlyOneShotWorkspace"]?.boolValue == true }
  }
}
