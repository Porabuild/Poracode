import AVKit
import SwiftUI

struct RichChatInlineVideo: View {
  let video: RichVideoPresentation
  @Environment(\.richChatFileDownloads) private var downloads

  var body: some View {
    if let downloads {
      RichChatVideoView(video: video, controller: downloads.controller, projectLocation: downloads.location)
        .frame(maxWidth: 480)
    }
  }
}

private final class RichChatVideoPlayback: Identifiable {
  let id = UUID()
  let player: AVPlayer
  let directory: URL?

  init(url: URL, directory: URL? = nil) {
    player = AVPlayer(url: url)
    self.directory = directory
  }

  deinit {
    if let directory { try? FileManager.default.removeItem(at: directory) }
  }
}

struct RichChatVideoView: View {
  let video: RichVideoPresentation
  let controller: RichChatMediaController
  let projectLocation: ProjectLocation?

  @Environment(\.scenePhase) private var scenePhase
  @State private var playback: RichChatVideoPlayback?
  @State private var loading = false
  @State private var failed = false
  @State private var task: Task<Void, Never>?

  var body: some View {
    Button(action: open) {
      VStack(spacing: 8) {
        if loading { ProgressView() }
        else { Image(systemName: "play.circle.fill").font(.title) }
        Text(video.name).font(.caption).lineLimit(2).truncationMode(.middle)
      }
      .frame(maxWidth: .infinity, minHeight: 80)
      .padding(8)
      .contentShape(PoracodeShapes.content)
      .background(.secondary.opacity(0.08), in: PoracodeShapes.content)
    }
    .buttonStyle(.plain)
    .disabled(loading)
    .accessibilityLabel("\(RichChatStrings.playVideo): \(video.name)")
    .sheet(item: $playback) { owner in
      NavigationStack {
        VideoPlayer(player: owner.player)
          .navigationTitle(video.name)
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(RichChatStrings.done) { playback = nil }
            }
          }
          .onDisappear { owner.player.pause() }
      }
      .poracodePageSheetSizing()
    }
    .alert(RichChatStrings.downloadFailed(video.name), isPresented: $failed) {
      Button(RichChatStrings.retry, action: open)
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .onDisappear(perform: cancel)
    .onChange(of: controller.state.target) { cancel() }
    .onChange(of: projectLocation) { cancel() }
    .onChange(of: video) { cancel() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { cancel() }
    }
  }

  private func open() {
    guard !loading else { return }
    if let url = video.externalURL {
      playback = RichChatVideoPlayback(url: url)
      return
    }
    guard let location = projectLocation,
      let request = try? RichChatFilePolicy.resolve(video.target, location: location)
    else { failed = true; return }
    loading = true
    task = Task { @MainActor in
      defer { loading = false }
      if let file = await controller.fetchFileDownload(request: request, projectLocation: location, suggestedName: video.name) {
        guard !Task.isCancelled else {
          try? FileManager.default.removeItem(at: file.directory)
          return
        }
        playback = RichChatVideoPlayback(url: file.fileURL, directory: file.directory)
      } else if !Task.isCancelled { failed = true }
    }
  }

  private func cancel() {
    task?.cancel()
    task = nil
    playback?.player.pause()
    playback = nil
    loading = false
  }
}
