import AVKit
import Combine
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

private struct RichChatVideoPlayerSheet: View {
  let playback: RichChatVideoPlayback
  let title: String
  let close: () -> Void
  @State private var status = AVPlayer.TimeControlStatus.paused

  var body: some View {
    let player = playback.player
    NavigationStack {
      VideoPlayer(player: player)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(RichChatStrings.done, action: close)
          }
          ToolbarItem(placement: .topBarTrailing) {
            PoracodeToolbarIconButton(
              title: status == .paused ? RichChatStrings.playVideo : RichChatStrings.pauseVideo,
              systemImage: status == .paused ? "play.fill" : "pause.fill",
              color: .primary
            ) {
              if player.timeControlStatus == .paused { player.play() }
              else { player.pause() }
            }
            .accessibilityIdentifier("native-e2e.transcript-video.toggle-playback")
          }
        }
        .onReceive(player.publisher(for: \.timeControlStatus).receive(on: RunLoop.main)) {
          status = $0
        }
        .onDisappear { player.pause() }
    }
    .poracodePageSheetSizing()
  }
}

struct RichChatVideoView: View {
  let video: RichVideoPresentation
  let controller: RichChatMediaController
  let projectLocation: ProjectLocation?

  @Environment(\.scenePhase) private var scenePhase
  @State private var playback: RichChatVideoPlayback?
  @State private var failed = false
  @State private var downloadTask = OwnedTaskSlot()

  private var loading: Bool { downloadTask.current != nil }

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
      RichChatVideoPlayerSheet(playback: owner, title: video.name) {
        if playback?.id == owner.id { playback = nil }
      }
    }
    .alert(RichChatStrings.downloadFailed(video.name), isPresented: $failed) {
      Button(RichChatStrings.retry, action: open)
      Button(RichChatStrings.cancel, role: .cancel) {}
    }
    .modifier(PoracodeRetainNavigationWhilePresented(isPresented: loading || playback != nil))
    .onDisappear(perform: cancel)
    .onChange(of: ObjectIdentifier(controller)) { cancel() }
    .onChange(of: controller.state.target) { cancel() }
    .onChange(of: projectLocation) { cancel() }
    .onChange(of: video) { cancel() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { cancel() }
    }
  }

  private func open() {
    guard !loading, playback == nil else { return }
    failed = false
    if let url = video.externalURL {
      playback = RichChatVideoPlayback(url: url)
      return
    }
    guard let location = projectLocation,
      let request = try? RichChatFilePolicy.resolve(video.target, location: location)
    else { failed = true; return }
    var token: UInt64 = 0
    let task = Task { @MainActor in
      defer { downloadTask.clearIfCurrent(token) }
      if let file = await controller.fetchFileDownload(request: request, projectLocation: location, suggestedName: video.name) {
        guard !Task.isCancelled, downloadTask.isCurrent(token) else {
          try? FileManager.default.removeItem(at: file.directory)
          return
        }
        playback = RichChatVideoPlayback(url: file.fileURL, directory: file.directory)
      } else if !Task.isCancelled, downloadTask.isCurrent(token) {
        failed = true
      }
    }
    token = downloadTask.install(task)
  }

  private func cancel() {
    downloadTask.cancelCurrent()
    playback?.player.pause()
    playback = nil
    failed = false
  }
}
