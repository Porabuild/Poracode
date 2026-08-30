import SwiftUI
import UIKit

struct RichChatImageView: View {
  let source: RichImagePresentation
  let controller: RichChatMediaController

  @State private var phase: Phase = .loading
  @State private var preview: Preview?
  @State private var sharePayload: SharePayload?

  private enum Phase {
    case loading
    case loaded(UIImage)
    case unavailable
  }

  private struct Preview: Identifiable {
    let id: String
    let image: UIImage
  }

  var body: some View {
    Group {
      switch phase {
      case .loading:
        ProgressView().frame(maxWidth: .infinity, minHeight: 90)
      case .loaded(let image):
        Button {
          preview = Preview(id: source.id, image: image)
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
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .task(id: source.id) { await load() }
    .fullScreenCover(item: $preview) { preview in
      RichChatImagePreview(image: preview.image)
    }
    .sheet(item: $sharePayload) { payload in
      RichChatImageShareSheet(image: payload.image)
    }
  }

  private func load() async {
    phase = .loading
    let payload: Data?
    switch source {
    case .inline(let source, let classification):
      payload = RichChatPresentation.inlineImageData(
        source: source,
        classification: classification
      )
    case .local(let path):
      payload = await controller.fetchImagePayload(.local(path: path))?.data
    case .remote(let reference):
      payload = await controller.fetchImagePayload(.remote(reference))?.data
    }
    guard !Task.isCancelled, let payload, let image = UIImage(data: payload) else {
      if !Task.isCancelled { phase = .unavailable }
      return
    }
    phase = .loaded(image)
  }
}

private struct SharePayload: Identifiable {
  let id = UUID()
  let image: UIImage
}

private struct RichChatImagePreview: View {
  let image: UIImage

  @Environment(\.dismiss) private var dismiss
  @State private var sharePayload: SharePayload?

  var body: some View {
    NavigationStack {
      RichChatZoomableImageView(image: image)
        .background(Color.black)
        .ignoresSafeArea(edges: .bottom)
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
              UIPasteboard.general.image = image
              UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            Button(RichChatMessageActionStrings.shareImage, systemImage: "square.and.arrow.up") {
              sharePayload = SharePayload(image: image)
            }
          }
        }
        .sheet(item: $sharePayload) { payload in
          RichChatImageShareSheet(image: payload.image)
        }
    }
  }
}

private struct RichChatImageShareSheet: UIViewControllerRepresentable {
  let image: UIImage

  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [image], applicationActivities: nil)
  }

  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

private struct RichChatZoomableImageView: UIViewRepresentable {
  let image: UIImage

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> UIScrollView {
    let scrollView = UIScrollView()
    scrollView.backgroundColor = .black
    scrollView.delegate = context.coordinator
    scrollView.minimumZoomScale = 1
    scrollView.maximumZoomScale = 5
    scrollView.bouncesZoom = true
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false

    let imageView = context.coordinator.imageView
    imageView.image = image
    imageView.contentMode = .scaleAspectFit
    imageView.isUserInteractionEnabled = true
    imageView.translatesAutoresizingMaskIntoConstraints = false
    imageView.accessibilityLabel = RichChatStrings.conversationImage
    scrollView.addSubview(imageView)
    NSLayoutConstraint.activate([
      imageView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
      imageView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
      imageView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
      imageView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
      imageView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
      imageView.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
    ])

    let doubleTap = UITapGestureRecognizer(
      target: context.coordinator,
      action: #selector(Coordinator.toggleZoom(_:))
    )
    doubleTap.numberOfTapsRequired = 2
    scrollView.addGestureRecognizer(doubleTap)
    context.coordinator.scrollView = scrollView
    return scrollView
  }

  func updateUIView(_ scrollView: UIScrollView, context: Context) {
    if context.coordinator.imageView.image !== image {
      context.coordinator.imageView.image = image
      scrollView.setZoomScale(scrollView.minimumZoomScale, animated: false)
    }
  }

  final class Coordinator: NSObject, UIScrollViewDelegate {
    let imageView = UIImageView()
    weak var scrollView: UIScrollView?

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
      imageView
    }

    @objc func toggleZoom(_ recognizer: UITapGestureRecognizer) {
      guard let scrollView else { return }
      if scrollView.zoomScale > scrollView.minimumZoomScale {
        scrollView.setZoomScale(scrollView.minimumZoomScale, animated: true)
        return
      }
      let location = recognizer.location(in: imageView)
      let targetScale = min(2.5, scrollView.maximumZoomScale)
      let size = CGSize(
        width: scrollView.bounds.width / targetScale,
        height: scrollView.bounds.height / targetScale
      )
      scrollView.zoom(
        to: CGRect(
          x: location.x - size.width / 2,
          y: location.y - size.height / 2,
          width: size.width,
          height: size.height
        ),
        animated: true
      )
    }
  }
}
