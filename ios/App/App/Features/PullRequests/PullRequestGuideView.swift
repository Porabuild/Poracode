import SwiftUI

struct PullRequestGuideView: View {
  @Bindable var forge: ForgeReviewController
  let writers: [AgentStatusRecord]
  let finish: () -> Void
  @State private var writer = ""
  @State private var model = ""
  @State private var instructions = ""
  @State private var stopIndex = 0

  private var document: GitHubDocument? { forge.documents[.forgeGetPrReviewGuide] }
  private var guide: [String: GitHubJSONValue]? { document?["guide"]?.objectValue }
  private var stops: [[String: GitHubJSONValue]] { guide?["stops"]?.arrayValue?.compactMap(\.objectValue) ?? [] }
  private var index: Int { min(stopIndex, max(0, stops.count - 1)) }
  private var isGenerating: Bool { document?["status"]?.stringValue == "generating" }
  private var stale: Bool { document?["stale"]?.boolValue != false || document.map { !forge.matchesDisplayedDiff($0) } != false }
  private var writerKinds: [String] { Array(Set(writers.map(\.kind))).sorted() }
  private var selectedWriter: String { writerKinds.contains(writer) ? writer : writerKinds.first ?? "" }

  var body: some View {
    List {
      Section {
        Picker(PullRequestsStrings.guideText("Guide writer"), selection: $writer) {
          ForEach(writerKinds, id: \.self) { kind in
            Text(writers.first { $0.kind == kind }?.label ?? kind).tag(kind)
          }
        }
        TextField(PullRequestsStrings.guideText("Guide model"), text: $model)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        TextField(PullRequestsStrings.guideText("Review guide instructions"), text: $instructions, axis: .vertical)
          .lineLimit(2...6)
        Button(PullRequestsStrings.guideText(guide == nil ? "Write guide" : "Rewrite guide")) {
          Task {
            var fields: [String: GitHubJSONValue] = [
              "agentKind": .string(selectedWriter),
              "instructions": .string(instructions),
              "language": .string(Locale.current.localizedString(forLanguageCode: Locale.current.language.languageCode?.identifier ?? "en") ?? "English"),
            ]
            if !model.isEmpty { fields["selection"] = .object(["model": .string(model)]) }
            await forge.mutate(.forgeWritePrReviewGuide, fields: fields)
          }
        }
        .disabled(!forge.canMutate || selectedWriter.isEmpty || isGenerating || instructions.count > 16000)
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
    .safeAreaInset(edge: .bottom) {
      if !stops.isEmpty {
        PoracodeBottomActionBar {
          Button(PullRequestsStrings.guideText("Back")) { stopIndex = index - 1 }.disabled(index == 0)
        } trailing: {
          if index < stops.count - 1 {
            Button(PullRequestsStrings.guideText("Next")) { stopIndex = index + 1 }
          } else {
            Button(PullRequestsStrings.guideText("Finish review"), action: finish).disabled(!forge.canMutate)
          }
        }
      }
    }
    .onAppear { writer = selectedWriter }
    .onChange(of: guide?["fingerprint"]) { _, _ in stopIndex = 0 }
    .task(id: "\(isGenerating):\(forge.isCached)") {
      while isGenerating && !forge.isCached && !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(5)) } catch { return }
        await forge.refreshGuide()
      }
    }
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
