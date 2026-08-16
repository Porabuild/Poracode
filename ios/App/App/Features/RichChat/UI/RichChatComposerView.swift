import SwiftUI
import UniformTypeIdentifiers

struct RichChatUploadedAttachment: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let mimeType: String
  let remotePath: String
}

struct RichChatComposerView: View {
  @Binding var draft: String
  @Binding var attachments: [RichChatUploadedAttachment]
  let canOperate: Bool
  let isWorking: Bool
  let controller: RichChatConversationController
  let mediaController: RichChatMediaController
  let config: [String: RichJSON]

  @State private var showingImporter = false
  @State private var importing = false
  @State private var attachmentError: String?
  @FocusState private var focused: Bool

  var body: some View {
    VStack(spacing: 6) {
      if !attachments.isEmpty { attachmentChips }
      if let attachmentError {
        Text(attachmentError).font(.caption).foregroundStyle(.red)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      if canOperate {
        composerRow
      } else {
        Label(RichChatStrings.readOnly, systemImage: "lock")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(.bar)
    .fileImporter(
      isPresented: $showingImporter,
      allowedContentTypes: [.data],
      allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        Task { await upload(url) }
      }
    }
  }

  private var composerRow: some View {
    HStack(alignment: .bottom, spacing: 8) {
      Button {
        showingImporter = true
      } label: {
        if importing { ProgressView() } else { Image(systemName: "paperclip") }
      }
      .buttonStyle(.bordered)
      .disabled(importing || controller.state.isSending)
      .accessibilityLabel(RichChatStrings.addAttachment)

      TextField(RichChatStrings.message, text: $draft, axis: .vertical)
        .lineLimit(1...6)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .focused($focused)
        .accessibilityLabel(RichChatStrings.message)
        .accessibilityIdentifier("native-e2e.composer")
        .onSubmit { send() }

      if isWorking || controller.state.isSending {
        Button { Task { await controller.interrupt() } } label: {
          Image(systemName: "stop.fill")
        }
        .buttonStyle(.borderedProminent)
        .accessibilityLabel(RichChatStrings.stop)
        .accessibilityIdentifier("native-e2e.interrupt")
      } else {
        Button(action: send) {
          Image(systemName: "arrow.up")
        }
        .poracodeProminentButtonStyle()
        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || importing)
        .accessibilityLabel(RichChatStrings.send)
        .accessibilityIdentifier("native-e2e.send")
      }
    }
  }

  private var attachmentChips: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(attachments) { attachment in
          Button {
            attachments.removeAll { $0.id == attachment.id }
          } label: {
            Label(attachment.name, systemImage: "xmark.circle.fill")
              .font(.caption)
          }
          .buttonStyle(.bordered)
          .accessibilityLabel("\(RichChatStrings.removeAttachment): \(attachment.name)")
        }
      }
    }
  }

  private func send() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    let segments = attachments.map {
      RichPromptSegment.attachment(path: $0.remotePath, mimeType: $0.mimeType)
    }
    Task {
      await controller.send(
        RichChatSendInput(
          prompt: text,
          config: config,
          segments: segments.isEmpty ? nil : segments,
          userMessageItemID: "user-\(UUID().uuidString.lowercased())"
        )
      )
      if controller.state.failure == nil {
        draft = ""
        attachments = []
        focused = false
      }
    }
  }

  private func upload(_ url: URL) async {
    importing = true
    attachmentError = nil
    defer { importing = false }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
      guard let size = values.fileSize,
        RichAttachmentPolicy.evaluate(name: values.name ?? url.lastPathComponent, byteCount: Int64(size))
          .accepted
      else {
        attachmentError = RichChatStrings.invalidAttachment
        return
      }
      let data = try Data(contentsOf: url, options: [.mappedIfSafe])
      let name = values.name ?? url.lastPathComponent
      let mime = values.contentType?.preferredMIMEType ?? "application/octet-stream"
      let plan = RichChatMediaController.attachmentPlan(name: name, contentType: mime, data: data)
      await mediaController.upload(plan)
      guard mediaController.state.failure == nil,
        let path = mediaController.state.uploadedAttachmentPath
      else {
        attachmentError = mediaController.state.failure.map(RichChatStrings.failure)
          ?? RichChatStrings.uploadFailed
        return
      }
      attachments.append(
        RichChatUploadedAttachment(name: name, mimeType: mime, remotePath: path)
      )
    } catch {
      attachmentError = RichChatStrings.uploadFailed
    }
  }
}
