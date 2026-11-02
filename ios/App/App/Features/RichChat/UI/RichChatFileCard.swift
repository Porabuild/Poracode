import SwiftUI
import UIKit

/// Download context injected at the transcript root so any card can mint an
/// authenticated attachment download on the selected host.
struct RichChatFileDownloadContext: Sendable {
  let controller: RichChatMediaController
  let location: ProjectLocation
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

/// A completed download owned by whoever retains it last — the view's state
/// AND the sheet's view closure. Releasing the final reference removes the
/// private directory (RAII): sheet teardown, swipe dismiss, and card
/// cancellation all end the same way.
private final class StagedChatFile: Identifiable {
  let download: RichChatFileDownload
  var id: String { download.directory.path }
  var url: URL { download.fileURL }

  init(download: RichChatFileDownload) {
    self.download = download
  }

  deinit {
    try? FileManager.default.removeItem(at: download.directory)
  }
}

/// Compact downloadable file card: neutral document/archive icon, truncating
/// filename, and a trailing 44pt download target.
struct RichChatFileCard: View {
  let ref: RichChatFileRef

  @Environment(\.richChatFileDownloads) private var downloads
  @State private var pending = false
  /// The RAII owner of the presented download — the sheet closure retains it
  /// until teardown so cleanup always fires on the last release.
  @State private var presentedFile: StagedChatFile?
  @State private var failure = false
  @State private var task: Task<Void, Never>?

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: iconName)
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(width: 16)
      Text(ref.fileName)
        .poracodeChatText(.metadata, weight: .medium)
        .lineLimit(1)
        .truncationMode(.middle)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: download) {
        if pending {
          ProgressView().controlSize(.mini).tint(.secondary)
            .frame(width: 44, height: 44)
        } else {
          Image(systemName: "arrow.down.circle")
            .font(.body)
            .foregroundStyle(failure ? Color.red : Color.secondary)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
      }
      .buttonStyle(.plain)
      .disabled(pending || presentedFile != nil || downloads == nil)
      .accessibilityLabel(RichChatStrings.downloadFile(ref.fileName))
      .accessibilityValue(ref.path)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
    .alert(RichChatStrings.downloadFailed(ref.fileName), isPresented: $failure) {
      Button(RichChatStrings.retry) { download() }
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .sheet(item: $presentedFile) { item in
      // Capturing `item` retains the RAII owner through sheet completion and
      // teardown; an old callback can never nil a newer presented owner.
      RichChatShareSheet(fileURL: item.url) {
        if presentedFile?.id == item.id { presentedFile = nil }
      }
    }
    .onDisappear(perform: cancelAndCleanup)
    .onChange(of: downloads.map { ObjectIdentifier($0.controller) }) { _ in cancelAndCleanup() }
    .onChange(of: downloads?.location) { _ in cancelAndCleanup() }
    .onChange(of: downloads?.controller.state.target) { _ in cancelAndCleanup() }
    .onChange(of: ref) { _ in cancelAndCleanup() }
  }

  private var iconName: String {
    switch ref.path.split(separator: ".").last?.lowercased() {
    case "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar": "doc.zipper"
    case "pdf": "doc.richtext"
    case "apk", "aab", "ipa", "dmg", "pkg", "exe", "msi", "deb", "rpm": "shippingbox"
    default: "doc"
    }
  }

  /// Pending covers the whole download+sheet lifecycle so a second tap never
  /// restarts the transfer while a share sheet is already up.
  private func download() {
    guard let context = downloads, !pending, presentedFile == nil else { return }
    guard let access = try? RichChatFilePolicy.resolve(ref.path, location: context.location)
    else {
      failure = true
      return
    }
    let owner = context.controller
    let ownerLocation = context.location
    pending = true
    task = Task { @MainActor in
      defer { pending = false }
      if let download = await context.controller.fetchFileDownload(
        request: access,
        projectLocation: ownerLocation,
        suggestedName: ref.fileName
      ) {
        // The host/thread selection can change while the sheet is staged; a
        // cancelled card never surfaces a failure and cleans its own file.
        guard !Task.isCancelled, downloads?.controller === owner,
          downloads?.location == ownerLocation
        else {
          try? FileManager.default.removeItem(at: download.directory)
          return
        }
        presentedFile = StagedChatFile(download: download)
      } else if !Task.isCancelled {
        failure = true
      }
    }
  }

  private func cancelAndCleanup() {
    task?.cancel()
    task = nil
    // Nilling state releases this card's retain on the presented owner; the
    // sheet's own retained class keeps the bytes alive until teardown ends.
    presentedFile = nil
    pending = false
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
