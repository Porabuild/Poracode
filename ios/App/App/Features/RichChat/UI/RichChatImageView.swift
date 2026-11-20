import ImageIO
import SwiftUI
import UIKit

enum RichChatImageDecoder {
  /// Decodes image bytes off the main actor. Inline cards pass `maxPixelSize`
  /// to downsample via ImageIO so large 4K images do not allocate tens of
  /// megabytes of uncompressed RGBA backing store or block scrolling.
  nonisolated static func decode(data: Data, maxPixelSize: Int?) -> UIImage? {
    if let maxPixelSize, maxPixelSize > 0,
      let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary)
    {
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
      ]
      if let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) {
        return UIImage(cgImage: cgImage)
      }
    }
    return UIImage(data: data)
  }
}

private struct RichChatImageSourcesKey: EnvironmentKey {
  static let defaultValue: @MainActor () -> [RichImagePresentation] = { [] }
}

extension EnvironmentValues {
  var richChatImageSources: @MainActor () -> [RichImagePresentation] {
    get { self[RichChatImageSourcesKey.self] }
    set { self[RichChatImageSourcesKey.self] = newValue }
  }
}

private enum RichChatImageLoadPhase {
  case loading
  case loaded(UIImage)
  case unavailable

  @MainActor
  static func load(
    _ source: RichImagePresentation,
    controller: RichChatMediaController,
    variant: RichImageVariant? = nil
  ) async -> Self {
    let payload: Data?
    switch source {
    case .inline(let source, let classification):
      payload = RichChatPresentation.inlineImageData(source: source, classification: classification)
    case .local(let path):
      payload = await controller.fetchImagePayload(.local(path: path), variant: variant)?.data
    case .remote(let reference):
      payload = await controller.fetchImagePayload(.remote(reference), variant: variant)?.data
    }
    guard !Task.isCancelled, let payload else {
      return .unavailable
    }
    let maxPixelSize: Int? = variant == .card ? 1280 : nil
    let image = await Task.detached(priority: .userInitiated) {
      RichChatImageDecoder.decode(data: payload, maxPixelSize: maxPixelSize)
    }.value
    guard !Task.isCancelled, let image else {
      return .unavailable
    }
    return .loaded(image)
  }

  var image: UIImage? {
    if case .loaded(let image) = self { return image }
    return nil
  }
}

private struct RichChatOpenedImage: Identifiable {
  let source: RichImagePresentation
  let image: UIImage
  var id: String { source.id }
}

struct RichChatImageView: View {
  let source: RichImagePresentation
  let controller: RichChatMediaController

  @State private var phase: RichChatImageLoadPhase = .loading
  @State private var preview: RichChatOpenedImage?
  @State private var sharePayload: SharePayload?

  var body: some View {
    Group {
      switch phase {
      case .loading:
        ProgressView().frame(maxWidth: .infinity, minHeight: 90)
      case .loaded(let image):
        Button {
          preview = RichChatOpenedImage(source: source, image: image)
        } label: {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(maxHeight: 360)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(RichChatStrings.conversationImage)
        .accessibilityHint(RichChatMessageActionStrings.openImagePreview)
        .contextMenu {
          Button(RichChatMessageActionStrings.copyImage, systemImage: "doc.on.doc") {
            UIPasteboard.general.image = image
            UINotificationFeedbackGenerator().notificationOccurred(.success)
          }
          Button(RichChatMessageActionStrings.shareImage, systemImage: "square.and.arrow.up") {
            sharePayload = SharePayload(image: image)
          }
        }
      case .unavailable:
        Label(RichChatStrings.imageUnavailable, systemImage: "photo.badge.exclamationmark")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 80)
      }
    }
    .clipShape(PoracodeShapes.content)
    .task(id: source.id) {
      phase = .loading
      let resolved = await RichChatImageLoadPhase.load(
        source,
        controller: controller,
        variant: .card
      )
      if !Task.isCancelled { phase = resolved }
    }
    .fullScreenCover(item: $preview) { preview in
      RichChatImagePreview(opened: preview, controller: controller)
        .modifier(PoracodeRetainNavigationWhilePresented())
    }
    .sheet(item: $sharePayload) { payload in
      RichChatImageShareSheet(image: payload.image)
        .modifier(PoracodeRetainNavigationWhilePresented())
    }
  }
}

private struct SharePayload: Identifiable {
  let id = UUID()
  let image: UIImage
}

private struct RichChatImagePreview: View {
  let opened: RichChatOpenedImage
  let controller: RichChatMediaController

  @Environment(\.dismiss) private var dismiss
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  @Environment(\.richChatImageSources) private var imageSources
  @State private var selected: RichImagePresentation
  @State private var phase: RichChatImageLoadPhase
  @State private var sharePayload: SharePayload?

  init(opened: RichChatOpenedImage, controller: RichChatMediaController) {
    self.opened = opened
    self.controller = controller
    _selected = State(initialValue: opened.source)
    _phase = State(initialValue: .loaded(opened.image))
  }

  var body: some View {
    let gallery = imageSources()
    let selectedID = selected.id
    let galleryPosition = gallery.firstIndex { $0.id == selectedID }
    let sources = galleryPosition == nil ? [selected] + gallery : gallery
    let position = galleryPosition ?? 0
    NavigationStack {
      imageContent(page: sources.count > 1 ? { offset in move(offset, in: sources, from: position) } : nil)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .poracodeThemeBackground(.black)
        .ignoresSafeArea(edges: sources.count > 1 && horizontalSizeClass != .regular ? [] : .bottom)
        .navigationTitle(RichChatMessageActionStrings.imagePreview)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button(RichChatMessageActionStrings.closeImagePreview, systemImage: "xmark") {
              dismiss()
            }
          }
          ToolbarItemGroup(placement: .topBarTrailing) {
            Button(RichChatMessageActionStrings.copyImage, systemImage: "doc.on.doc") {
              guard let image = phase.image else { return }
              UIPasteboard.general.image = image
              UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            .disabled(phase.image == nil)
            Button(RichChatMessageActionStrings.shareImage, systemImage: "square.and.arrow.up") {
              guard let image = phase.image else { return }
              sharePayload = SharePayload(image: image)
            }
            .disabled(phase.image == nil)
          }
          if sources.count > 1 {
            if horizontalSizeClass == .regular {
              ToolbarItemGroup(placement: .topBarTrailing) {
                pagingControls(sources, position: position)
              }
            } else {
              ToolbarItemGroup(placement: .bottomBar) {
                pagingControls(sources, position: position)
              }
            }
          }
        }
        .task(id: selected.id) {
          let source = selected
          let resolved = await RichChatImageLoadPhase.load(
            source,
            controller: controller,
            variant: nil
          )
          if !Task.isCancelled, selected.id == source.id {
            if case .loaded = resolved {
              phase = resolved
            } else if source.id != opened.id {
              phase = resolved
            }
          }
        }
        .sheet(item: $sharePayload) { payload in
          RichChatImageShareSheet(image: payload.image)
        }
    }
  }

  @ViewBuilder
  private func pagingControls(_ sources: [RichImagePresentation], position: Int) -> some View {
    Button(RichChatMessageActionStrings.previousImage, systemImage: "chevron.backward") {
      move(-1, in: sources, from: position)
    }
    .keyboardShortcut(.leftArrow, modifiers: [])
    Text("\((position + 1).formatted()) / \(sources.count.formatted())")
      .font(.footnote.monospacedDigit())
      .accessibilityLabel(RichChatMessageActionStrings.imagePosition(position + 1, of: sources.count))
      .accessibilityIdentifier("native-e2e.transcript-image.position")
    Button(RichChatMessageActionStrings.nextImage, systemImage: "chevron.forward") {
      move(1, in: sources, from: position)
    }
    .keyboardShortcut(.rightArrow, modifiers: [])
  }

  @ViewBuilder
  private func imageContent(page: ((Int) -> Void)?) -> some View {
    switch phase {
    case .loading:
      ProgressView().tint(.white)
    case .loaded(let image):
      RichChatZoomableImageView(image: image, page: page)
    case .unavailable:
      Label(RichChatStrings.imageUnavailable, systemImage: "photo.badge.exclamationmark")
        .foregroundStyle(.white)
    }
  }

  private func move(_ offset: Int, in sources: [RichImagePresentation], from position: Int) {
    let target = sources[(position + offset + sources.count) % sources.count]
    guard target.id != selected.id else { return }
    selected = target
    phase = target.id == opened.id ? .loaded(opened.image) : .loading
  }
}

private struct RichChatImageShareSheet: UIViewControllerRepresentable {
  let image: UIImage

  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [image], applicationActivities: nil)
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
