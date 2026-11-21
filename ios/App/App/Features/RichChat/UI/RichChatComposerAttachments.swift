import Foundation
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

private enum RichChatComposerAttachmentPresentation: Equatable {
  case photoPicker
  case camera
  case files
}

private enum RichChatComposerPhotoKind {
  case photo
  case screenshot

  var filter: PHPickerFilter {
    switch self {
    case .photo: .images
    case .screenshot: .screenshots
    }
  }

  var filenamePrefix: String {
    switch self {
    case .photo: "photo"
    case .screenshot: "screenshot"
    }
  }
}

struct RichChatComposerAttachmentButton: View {
  @Binding var attachments: [RichChatUploadedAttachment]
  @Binding var importing: Bool
  @Binding var errorMessage: String?
  let mediaController: RichChatMediaController
  let disabled: Bool
  var openSkills: (() -> Void)?
  var openControls: (() -> Void)?
  @Binding var configuration: ThreadConfig
  let launchConfiguration: ThreadConfig
  var planModes: [RichChatComposerOption] = []
  var openCrew: (() -> Void)?
  var openSideChat: (() -> Void)?
  var compactToolbar = false
  var sessionActionEntries: [RichChatSessionActionEntryTarget] = []
  var sessionActionsDisabled = false
  var sessionActionsFailure: String?
  var openSessionAction: (RichChatSessionActionPanelKind) -> Void = { _ in }
  var retrySessionActions: () -> Void = {}

  @State private var presentation: RichChatComposerAttachmentPresentation?
  @State private var photoKind: RichChatComposerPhotoKind?
  @State private var photoItem: PhotosPickerItem?

  var body: some View {
    Group {
      if compactToolbar {
        Menu {
          attachmentMenu
        } label: {
          if importing {
            ProgressView().controlSize(.small)
              .frame(width: 28, height: 28)
          } else {
            Image(systemName: "plus")
              .font(.subheadline.weight(.medium))
              .foregroundStyle(.primary.opacity(0.9))
              .frame(width: 32, height: 32)
              .background(Color.primary.opacity(0.12), in: Circle())
              .frame(width: 44, height: 44)
              .contentShape(Circle())
          }
        }
        .foregroundStyle(.secondary)
        .tint(.secondary)
      } else {
        PoracodeCircleMenu {
          attachmentMenu
        } label: {
          menuLabel
        }
      }
    }
    .disabled(disabled || importing)
    .accessibilityLabel(RichChatStrings.addAttachmentOrCapability)
    .accessibilityIdentifier("native-e2e.composer.add")
    .photosPicker(
      isPresented: isPresenting(.photoPicker),
      selection: $photoItem,
      matching: photoKind?.filter ?? .images
    )
    .onChange(of: photoItem) { _, item in
      guard let item, let kind = photoKind else { return }
      Task {
        await upload(item, kind: kind)
        photoItem = nil
        photoKind = nil
      }
    }
    .fileImporter(
      isPresented: isPresenting(.files),
      allowedContentTypes: [.data],
      allowsMultipleSelection: false
    ) { result in
      if case .success(let urls) = result, let url = urls.first {
        Task { await upload(url) }
      }
    }
    .fullScreenCover(isPresented: isPresenting(.camera)) {
      HomeComposerCameraPicker(isPresented: isPresenting(.camera)) { data in
        Task {
          await upload(
            data: data,
            name: "photo-\(UUID().uuidString.lowercased()).jpg",
            mimeType: "image/jpeg"
          )
        }
      }
      .ignoresSafeArea()
    }
  }

  @ViewBuilder
  private var attachmentMenu: some View {
    Section {
      Button(HomeStrings.files, systemImage: "paperclip") { presentation = .files }
      Menu(HomeStrings.photos, systemImage: "photo") {
        Button(HomeStrings.photos, systemImage: "photo") { presentPhotos(.photo) }
        Button(HomeStrings.screenshots, systemImage: "viewfinder") { presentPhotos(.screenshot) }
        Button(HomeStrings.camera, systemImage: "camera") { presentation = .camera }
          .disabled(!HomeComposerCameraPicker.isAvailable)
      }
    }
    if planModes.contains(where: { $0.id == "plan" }),
      RichChatComposerControlCatalog.nonPlanMode(in: planModes) != nil {
      Button {
        configuration.mode = RichChatComposerControlCatalog.modeAfterToggling("plan",
          current: configuration.mode, options: planModes)
      } label: {
        Label(RichChatStrings.plan, systemImage: configuration.mode == "plan" ? "checkmark" : "list.bullet.clipboard")
      }
    }
    if planModes.contains(where: { $0.id == "agent" }) {
      ForEach(planModes.filter { $0.id != "agent" && $0.id != "plan" }) { option in
        Button {
          configuration.mode = RichChatComposerControlCatalog.modeAfterToggling(option.id,
            current: configuration.mode, options: planModes)
        } label: {
          if configuration.mode == option.id { Label(option.label, systemImage: "checkmark") }
          else { Text(option.label) }
        }
      }
    }
    RichChatComposerCapabilitiesMenu(configuration: launchConfiguration)
    if let openSideChat {
      Button(SideChatStrings.title, systemImage: "bubble.left.and.bubble.right", action: openSideChat)
        .accessibilityIdentifier("native-e2e.composer.side-chat")
    }
    if let openCrew { Button(RichChatStrings.crew, systemImage: "person.2", action: openCrew) }
    if let openSkills { Button(SettingsIntegrationsStrings.skills, systemImage: "wand.and.stars", action: openSkills) }
    if !sessionActionEntries.isEmpty || sessionActionsFailure != nil {
      Menu(RichChatSessionActionStrings.entryLabel) {
        ForEach(sessionActionEntries, id: \.panel) { entry in
          Button(RichChatSessionActionStrings.label(for: entry.panel)) {
            openSessionAction(entry.panel)
          }
          .disabled(sessionActionsDisabled)
        }
        if let failure = sessionActionsFailure {
          Text(failure.isEmpty ? RichChatSessionActionStrings.entryFailed : failure)
          Button(RichChatStrings.retry, action: retrySessionActions)
        }
      }
    }
    if let openControls {
      Button(RichChatStrings.composerControls, systemImage: "slider.horizontal.3") { openControls() }
    }
  }

  @ViewBuilder
  private var menuLabel: some View {
    if importing {
      ProgressView().controlSize(.small)
    } else {
      Image(systemName: "plus")
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
    }
  }

  private func presentPhotos(_ kind: RichChatComposerPhotoKind) {
    photoKind = kind
    presentation = .photoPicker
  }

  private func isPresenting(
    _ expected: RichChatComposerAttachmentPresentation
  ) -> Binding<Bool> {
    Binding(
      get: { presentation == expected },
      set: { presented in
        if presented {
          presentation = expected
        } else if presentation == expected {
          presentation = nil
        }
      }
    )
  }

  private func upload(_ item: PhotosPickerItem, kind: RichChatComposerPhotoKind) async {
    importing = true
    errorMessage = nil
    defer { importing = false }
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        errorMessage = RichChatStrings.uploadFailed
        return
      }
      let type = item.supportedContentTypes.first ?? .jpeg
      let suffix = type.preferredFilenameExtension ?? "jpg"
      await upload(
        data: data,
        name: "\(kind.filenamePrefix)-\(UUID().uuidString.lowercased()).\(suffix)",
        mimeType: type.preferredMIMEType ?? "image/jpeg"
      )
    } catch {
      errorMessage = RichChatStrings.uploadFailed
    }
  }

  private func upload(_ url: URL) async {
    importing = true
    errorMessage = nil
    defer { importing = false }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
      guard let size = values.fileSize,
        RichAttachmentPolicy.evaluate(
          name: values.name ?? url.lastPathComponent,
          byteCount: Int64(size)
        ).accepted
      else {
        errorMessage = RichChatStrings.invalidAttachment
        return
      }
      let data = try Data(contentsOf: url, options: [.mappedIfSafe])
      await upload(
        data: data,
        name: values.name ?? url.lastPathComponent,
        mimeType: values.contentType?.preferredMIMEType ?? "application/octet-stream"
      )
    } catch {
      errorMessage = RichChatStrings.uploadFailed
    }
  }

  private func upload(data: Data, name: String, mimeType: String) async {
    guard RichAttachmentPolicy.evaluate(name: name, byteCount: Int64(data.count)).accepted else {
      errorMessage = RichChatStrings.invalidAttachment
      return
    }
    await mediaController.upload(
      RichChatMediaController.attachmentPlan(name: name, contentType: mimeType, data: data)
    )
    guard mediaController.state.failure == nil,
      let path = mediaController.state.uploadedAttachmentPath
    else {
      errorMessage =
        mediaController.state.failure.map(RichChatStrings.failure)
        ?? RichChatStrings.uploadFailed
      return
    }
    attachments.append(
      RichChatUploadedAttachment(name: name, mimeType: mimeType, remotePath: path)
    )
  }
}
