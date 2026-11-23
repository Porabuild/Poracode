import Foundation
import SwiftUI
import UIKit

// MARK: - Interactive Async Question-Answer Reply Form (sourceItemId)

struct AsyncQuestionReplySubmission: Equatable, Sendable {
  let sourceItemId: String
  let answers: [String: [String]]
  let customText: String

  func formattedReplyText() -> String {
    var lines: [String] = []
    for (question, choices) in answers.sorted(by: { $0.key < $1.key }) where !choices.isEmpty {
      lines.append("- \(question): \(choices.joined(separator: ", "))")
    }
    let trimmed = customText.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty { lines.append(trimmed) }
    return lines.joined(separator: "\n")
  }
}

struct RichChatAsyncQuestionReplyForm: View {
  let sourceItemId: String
  let questions: [(header: String, question: String, options: [String], multiSelect: Bool)]
  let onSubmit: (AsyncQuestionReplySubmission) -> Void

  @State private var selections: [String: Set<String>] = [:]
  @State private var customText = ""

  private var canSubmit: Bool {
    selections.values.contains(where: { !$0.isEmpty })
      || !customText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(questions.enumerated()), id: \.offset) { _, q in
        VStack(alignment: .leading, spacing: 6) {
          if !q.header.isEmpty {
            Text(q.header.uppercased())
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.secondary)
          }
          Text(q.question).font(.footnote.weight(.medium))
          ForEach(q.options, id: \.self) { option in
            let picked = selections[q.question]?.contains(option) == true
            Button {
              var current = selections[q.question] ?? []
              if q.multiSelect {
                if picked { current.remove(option) } else { current.insert(option) }
              } else {
                current = picked ? [] : [option]
              }
              selections[q.question] = current
            } label: {
              HStack(spacing: 8) {
                Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                  .foregroundStyle(picked ? Color.primary : .secondary)
                Text(option).font(.footnote)
                Spacer()
              }
              .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
          }
        }
      }
      TextField("Additional reply…", text: $customText, axis: .vertical)
        .textFieldStyle(.roundedBorder)
        .font(.footnote)
      Button("Send reply") {
        let map = selections.mapValues { Array($0).sorted() }
        onSubmit(AsyncQuestionReplySubmission(sourceItemId: sourceItemId, answers: map, customText: customText))
      }
      .poracodeSurfaceButtonStyle()
      .controlSize(.small)
      .disabled(!canSubmit)
    }
    .padding(10)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
  }
}

// MARK: - Prompt Rail & Sticky Prompt Header (thread-history-prompts)

struct RichChatPromptIndexEntry: Identifiable, Equatable, Sendable {
  let id: String
  let text: String
  let index: Int
}

struct RichChatStickyPromptBar: View {
  let activePrompt: RichChatPromptIndexEntry
  let totalPrompts: Int
  let onOpenRail: () -> Void

  var body: some View {
    Button(action: onOpenRail) {
      HStack(spacing: 8) {
        Image(systemName: "list.bullet.indent")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Text(activePrompt.text)
          .font(.caption)
          .lineLimit(1)
          .truncationMode(.tail)
          .foregroundStyle(.primary)
        Spacer(minLength: 4)
        Text("\(activePrompt.index + 1)/\(max(1, totalPrompts))")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .background(.ultraThinMaterial, in: Capsule())
    }
    .buttonStyle(.plain)
  }
}

struct RichChatPromptRailSheet: View {
  let prompts: [RichChatPromptIndexEntry]
  let onSelect: (RichChatPromptIndexEntry) -> Void
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List(prompts) { entry in
        Button {
          dismiss()
          onSelect(entry)
        } label: {
          HStack(alignment: .top, spacing: 10) {
            Text("#\(entry.index + 1)")
              .font(.caption.monospacedDigit().weight(.semibold))
              .foregroundStyle(.secondary)
              .frame(width: 28, alignment: .trailing)
            Text(entry.text)
              .font(.footnote)
              .lineLimit(3)
              .foregroundStyle(.primary)
          }
        }
      }
      .navigationTitle("Prompts")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
      }
    }
  }
}

// MARK: - Agent Vision Live Viewer (thread-agent-vision & agent-vision-*)

struct AgentVisionSnapshot: Equatable, Sendable {
  let active: Bool
  let sourceTitle: String?
  let sourceKind: String?
  let imageData: Data?
  let updatedAt: String?

  static func decode(_ data: Data) -> AgentVisionSnapshot? {
    guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    let obj = (root["vision"] as? [String: Any]) ?? root
    let rawUrl = (obj["imageDataUrl"] as? String) ?? (obj["frameDataUrl"] as? String) ?? (obj["dataUrl"] as? String)
    let base64 = rawUrl?.components(separatedBy: ",").last ?? (obj["frameBase64"] as? String)
    let decoded = base64.flatMap { Data(base64Encoded: $0) }
    return AgentVisionSnapshot(
      active: (obj["active"] as? Bool) ?? (decoded != nil),
      sourceTitle: (obj["title"] as? String) ?? (obj["url"] as? String),
      sourceKind: obj["kind"] as? String,
      imageData: decoded,
      updatedAt: obj["updatedAt"] as? String
    )
  }
}

enum AgentVisionWire {
  static func watchFrame(threadId: String) -> [String: Any] {
    ["type": "agent-vision-watch", "threadId": threadId]
  }
  static func unwatchFrame(threadId: String) -> [String: Any] {
    ["type": "agent-vision-unwatch", "threadId": threadId]
  }
  static func isVisionFrame(_ type: String) -> Bool {
    type == "agent-vision-frame"
  }
  static func fetch(threadId: String, api: RemoteAPIClient) async -> AgentVisionSnapshot? {
    let encoded = threadId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? threadId
    guard let data = try? await api.requestData(
      path: "/api/threads/\(encoded)/agent-vision",
      queryItems: [URLQueryItem(name: "preview", value: "1")]
    ) else { return nil }
    return AgentVisionSnapshot.decode(data)
  }
}

struct RichChatAgentVisionSheet: View {
  let threadId: String
  let api: RemoteAPIClient?
  @State private var snapshot: AgentVisionSnapshot?
  @State private var paused = false
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      VStack(spacing: 12) {
        if let data = snapshot?.imageData, let image = UIImage(data: data) {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding()
        } else {
          ContentUnavailableView(
            "Agent Vision",
            systemImage: "eye",
            description: Text("Waiting for live agent screen or browser frames.")
          )
        }
        if let title = snapshot?.sourceTitle, !title.isEmpty {
          Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
      }
      .navigationTitle("Agent Vision")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button(paused ? "Resume" : "Pause") { paused.toggle() }
        }
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
      }
      .task(id: paused) {
        guard let api, !paused else { return }
        while !Task.isCancelled {
          if let next = await AgentVisionWire.fetch(threadId: threadId, api: api) {
            snapshot = next
          }
          try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
      }
    }
  }
}
