import QuickLook
import SwiftUI
import UIKit

/// Download context injected at the transcript root so any card can mint an
/// authenticated attachment download on the selected host.
struct RichChatFileDownloadContext: Sendable {
  let controller: RichChatMediaController
  let location: ProjectLocation
  var resolveWorkspaceBasename: RichChatWorkspaceBasenameResolver? = nil
}

private struct RichChatFileDownloadContextKey: EnvironmentKey {
  static let defaultValue: RichChatFileDownloadContext? = nil
}

extension EnvironmentValues {
  var richChatFileDownloads: RichChatFileDownloadContext? {
    get { self[RichChatFileDownloadContextKey.self] }
    set { self[RichChatFileDownloadContextKey.self] = newValue }
  }
}

private enum RichChatFileAction {
  case share
  case preview
}

/// The view and its presented sheet retain the staged file. The final release
/// removes its private directory when the card or sheet is dismissed.
private final class StagedChatFile: Identifiable {
  let download: RichChatFileDownload
  let action: RichChatFileAction
  var id: String { download.directory.path }
  var url: URL { download.fileURL }

  init(download: RichChatFileDownload, action: RichChatFileAction) {
    self.download = download
    self.action = action
  }

  deinit {
    try? FileManager.default.removeItem(at: download.directory)
  }
}

/// Compact file card with a trailing download action and an opener for supported files.
struct RichChatFileCard: View {
  let ref: RichChatFileRef
  var findPart: RichChatFindPart? = nil

  @Environment(\.richChatFileDownloads) private var downloads
  @Environment(\.richChatFindHighlight) private var find
  @Environment(\.richChatProjectLinkLocation) private var projectLinkLocation
  @Environment(\.richChatOpenProjectFile) private var openProjectFile
  /// The RAII owner of the presented download — the sheet closure retains it
  /// until teardown so cleanup always fires on the last release.
  @State private var presentedFile: StagedChatFile?
  @State private var failedAction: RichChatFileAction?
  @State private var downloadTask = OwnedTaskSlot()

  private var pending: Bool { downloadTask.current != nil }
  private var canOpen: Bool { !pending && presentedFile == nil && downloads != nil }
  private var fileExtension: String { (ref.path as NSString).pathExtension.lowercased() }

  var body: some View {
    HStack(spacing: 8) {
      if let openProjectFile, let projectLinkLocation,
        let target = RichChatProjectFileLink.attachmentTarget(ref.path, in: projectLinkLocation)
      {
        Button { openProjectFile(target) } label: { fileOpenLabel }
          .buttonStyle(.plain)
          .disabled(pending || presentedFile != nil)
          .accessibilityIdentifier("native-e2e.transcript-project-file.open.\(ref.fileName)")
      } else if fileExtension == "pdf" {
        Button { open(.preview) } label: {
          fileOpenLabel
        }
        .buttonStyle(.plain)
        .disabled(!canOpen)
        .accessibilityLabel(RichChatStrings.previewFile(ref.fileName))
        .accessibilityIdentifier("native-e2e.transcript-pdf.preview")
      } else {
        fileLabel
      }
      Button { open(.share) } label: {
        if pending {
          ProgressView().controlSize(.mini).tint(.secondary)
            .frame(width: 44, height: 44)
        } else {
          Image(systemName: "arrow.down.circle")
            .font(.body)
            .foregroundStyle(failedAction == .share ? Color.red : Color.secondary)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
      }
      .buttonStyle(.plain)
      .disabled(!canOpen)
      .accessibilityLabel(RichChatStrings.downloadFile(ref.fileName))
      .accessibilityValue(ref.path)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.secondary.opacity(0.08), in: PoracodeShapes.content)
    .alert(RichChatStrings.downloadFailed(ref.fileName), isPresented: Binding(
      get: { failedAction != nil }, set: { if !$0 { failedAction = nil } }
    ), presenting: failedAction) { action in
      Button(RichChatStrings.retry) { open(action) }
      Button(RichChatStrings.cancel, role: .cancel) {}
    } message: { _ in
      EmptyView()
    }
    .sheet(item: $presentedFile) { item in
      // Capturing `item` retains the RAII owner through sheet completion and
      // teardown; an old callback can never nil a newer presented owner.
      let dismiss = { if presentedFile?.id == item.id { presentedFile = nil } }
      switch item.action {
      case .preview:
        RichChatPdfPreview(file: item, onDismiss: dismiss)
          .poracodePageSheetSizing()
      case .share:
        RichChatShareSheet(fileURL: item.url, onDismiss: dismiss)
      }
    }
    .modifier(PoracodeRetainNavigationWhilePresented(isPresented: pending || presentedFile != nil))
    .onDisappear(perform: cancelAndCleanup)
    .onChange(of: downloads.map { ObjectIdentifier($0.controller) }) { _ in cancelAndCleanup() }
    .onChange(of: downloads?.location) { _ in cancelAndCleanup() }
    .onChange(of: downloads?.controller.state.target) { _ in cancelAndCleanup() }
    .onChange(of: ref) { _ in cancelAndCleanup() }
  }

  private var fileOpenLabel: some View {
    fileLabel.frame(minHeight: 44).contentShape(Rectangle())
  }

  private var fileLabel: some View {
    HStack(spacing: 8) {
      Image(systemName: iconName)
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(width: 16)
      find.text(AttributedString(ref.fileName), part: findPart)
        .poracodeChatText(.metadata, weight: .medium)
        .lineLimit(find.revealsItem && find.active?.part == findPart ? nil : 1)
        .truncationMode(.middle)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var iconName: String {
    switch fileExtension {
    case "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar": "doc.zipper"
    case "pdf": "doc.richtext"
    case "apk", "aab", "ipa", "dmg", "pkg", "exe", "msi", "deb", "rpm": "shippingbox"
    default: "doc"
    }
  }

  /// The download slot and staged file gate new taps until the sheet dismisses.
  private func open(_ action: RichChatFileAction) {
    guard let context = downloads, canOpen else { return }
    failedAction = nil
    guard let access = try? RichChatFilePolicy.resolve(ref.path, location: context.location)
    else {
      failedAction = action
      return
    }
    let owner = context.controller
    let ownerLocation = context.location
    let filename = action == .preview && (ref.fileName as NSString).pathExtension.lowercased() != "pdf"
      ? ref.fileName + ".pdf" : ref.fileName
    let resolver = RichChatFilePolicy.usesWorkspaceBasenameLookup(ref.path) ? context.resolveWorkspaceBasename : nil
    var installToken: UInt64 = 0
    let task = Task { @MainActor in
      defer { downloadTask.clearIfCurrent(installToken) }
      if let download = await context.controller.fetchFileDownload(
        request: access,
        projectLocation: ownerLocation,
        suggestedName: filename,
        resolveWorkspaceBasename: resolver
      ) {
        // The host/thread selection can change while the sheet is staged; a
        // cancelled card never surfaces a failure and cleans its own file.
        guard !Task.isCancelled, downloadTask.isCurrent(installToken),
          downloads?.controller === owner,
          downloads?.location == ownerLocation
        else {
          try? FileManager.default.removeItem(at: download.directory)
          return
        }
        presentedFile = StagedChatFile(download: download, action: action)
      } else if !Task.isCancelled, downloadTask.isCurrent(installToken) {
        failedAction = action
      }
    }
    installToken = downloadTask.install(task)
  }

  private func cancelAndCleanup() {
    downloadTask.cancelCurrent()
    // Nilling state releases this card's retain on the presented owner; the
    // sheet's own retained class keeps the bytes alive until teardown ends.
    presentedFile = nil
    failedAction = nil
  }
}

private struct RichChatPdfPreview: UIViewControllerRepresentable {
  let file: StagedChatFile
  let onDismiss: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(file: file) }

  func makeUIViewController(context: Context) -> UINavigationController {
    let preview = QLPreviewController()
    preview.dataSource = context.coordinator
    preview.delegate = context.coordinator
    let close = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { _ in onDismiss() })
    close.accessibilityIdentifier = "native-e2e.transcript-pdf.close"
    preview.navigationItem.leftBarButtonItem = close
    return UINavigationController(rootViewController: preview)
  }

  func updateUIViewController(_ controller: UINavigationController, context: Context) {}

  final class Coordinator: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    private let file: StagedChatFile

    init(file: StagedChatFile) { self.file = file }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem {
      file.url as NSURL
    }

    func previewController(
      _ controller: QLPreviewController, editingModeFor previewItem: any QLPreviewItem
    ) -> QLPreviewItemEditingMode { .disabled }
  }
}

/// Native share sheet ("Save to Files") over the downloaded local file.
private struct RichChatShareSheet: UIViewControllerRepresentable {
  let fileURL: URL
  let onDismiss: () -> Void

  func makeUIViewController(context _: Context) -> UIActivityViewController {
    // Installed at creation so the callback is live from the first
    // presentation, not after the first update pass.
    let controller = UIActivityViewController(
      activityItems: [fileURL], applicationActivities: nil)
    controller.completionWithItemsHandler = { _, _, _, _ in
      Task { @MainActor in onDismiss() }
    }
    return controller
  }

  func updateUIViewController(_ controller: UIActivityViewController, context _: Context) {
    controller.completionWithItemsHandler = { _, _, _, _ in
      Task { @MainActor in onDismiss() }
    }
  }
}
