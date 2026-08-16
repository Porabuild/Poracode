import SwiftUI
import UIKit

struct RichChatImageView: View {
  let source: RichImagePresentation
  let controller: RichChatMediaController

  @State private var phase: Phase = .loading

  private enum Phase {
    case loading
    case loaded(UIImage)
    case unavailable
  }

  var body: some View {
    Group {
      switch phase {
      case .loading:
        ProgressView().frame(maxWidth: .infinity, minHeight: 90)
      case .loaded(let image):
        Image(uiImage: image)
          .resizable()
          .scaledToFit()
          .frame(maxHeight: 360)
          .accessibilityLabel(RichChatStrings.conversationImage)
      case .unavailable:
        Label(RichChatStrings.imageUnavailable, systemImage: "photo.badge.exclamationmark")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 80)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .task(id: source.id) { await load() }
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
