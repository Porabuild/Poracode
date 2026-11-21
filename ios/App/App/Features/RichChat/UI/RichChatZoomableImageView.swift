import SwiftUI
import UIKit

struct RichChatZoomableImageView: UIViewRepresentable {
  let image: UIImage
  let page: ((Int) -> Void)?

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  func makeUIView(context: Context) -> UIScrollView {
    let scrollView = UIScrollView()
    scrollView.accessibilityIdentifier = "native-e2e.transcript-image.canvas"
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
    for direction: UISwipeGestureRecognizer.Direction in [.left, .right] {
      let swipe = UISwipeGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.changePage(_:)))
      swipe.direction = direction
      swipe.delegate = context.coordinator
      scrollView.addGestureRecognizer(swipe)
      scrollView.panGestureRecognizer.require(toFail: swipe)
    }
    context.coordinator.scrollView = scrollView
    return scrollView
  }

  func updateUIView(_ scrollView: UIScrollView, context: Context) {
    context.coordinator.page = page
    if context.coordinator.imageView.image !== image {
      context.coordinator.imageView.image = image
      scrollView.setZoomScale(scrollView.minimumZoomScale, animated: false)
    }
  }

  final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
    let imageView = UIImageView()
    weak var scrollView: UIScrollView?
    var page: ((Int) -> Void)?

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
      imageView
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
      guard let scrollView else { return false }
      return page != nil && scrollView.zoomScale <= scrollView.minimumZoomScale
    }

    @objc func changePage(_ recognizer: UISwipeGestureRecognizer) {
      page?(recognizer.direction == .left ? 1 : -1)
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
