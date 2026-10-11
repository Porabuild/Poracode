import AVFoundation
import Foundation
import Observation
import SwiftUI

enum RemoteUserNotificationCategory: String, Sendable, Equatable {
  case done
  case needsAttention
  case error
}

/// Strict native projection of the host-owned `remote-user-notification` event.
/// The host classifies the transition; the client only validates and presents it.
struct RemoteUserNotificationEvent: Sendable, Equatable {
  private static let validStatuses: Set<String> = [
    "inactive", "launching", "working", "idle", "finished", "needs_approval", "needs_reply",
    "error",
  ]

  var threadId: String
  var category: RemoteUserNotificationCategory
  var projectName: String
  var threadTitle: String
  var status: String

  static func decodeIfPresent(_ wire: JSONValue) throws -> Self? {
    guard let object = wire.objectValue,
      object["type"]?.stringValue == "remote-user-notification"
    else { return nil }
    guard let threadId = object["threadId"]?.stringValue, !threadId.isEmpty else {
      throw GitStateDecoding.invalid("remote-user-notification.threadId")
    }
    guard let categoryRaw = object["category"]?.stringValue,
      let category = RemoteUserNotificationCategory(rawValue: categoryRaw)
    else {
      throw GitStateDecoding.invalid("remote-user-notification.category")
    }
    guard let projectName = object["projectName"]?.stringValue else {
      throw GitStateDecoding.invalid("remote-user-notification.projectName")
    }
    guard let threadTitle = object["threadTitle"]?.stringValue else {
      throw GitStateDecoding.invalid("remote-user-notification.threadTitle")
    }
    guard let status = object["status"]?.stringValue, validStatuses.contains(status) else {
      throw GitStateDecoding.invalid("remote-user-notification.status")
    }
    return Self(
      threadId: threadId,
      category: category,
      projectName: projectName,
      threadTitle: threadTitle,
      status: status
    )
  }
}

struct RemoteNotificationBanner: Identifiable, Sendable, Equatable {
  var id: UInt64
  var route: NotificationRoute
  var notification: RemoteUserNotificationEvent
}

@MainActor
@Observable
final class RemoteUserNotificationPresentationCenter {
  enum Source: Sendable, Equatable {
    case webSocket
    case push
  }

  private struct RecentDelivery {
    var source: Source
    var receivedAt: Date
  }

  static let shared = RemoteUserNotificationPresentationCenter()

  private(set) var banner: RemoteNotificationBanner?
  private(set) var isForeground = false
  private var sequence: UInt64 = 0
  private var recent: [NotificationRoute: RecentDelivery] = [:]
  private var dismissTask: Task<Void, Never>?
  private let deduplicationWindow: TimeInterval
  private let bannerDuration: Duration
  private let playSound: @MainActor () -> Void

  init(
    deduplicationWindow: TimeInterval = 15,
    bannerDuration: Duration = .seconds(6),
    playSound: @escaping @MainActor () -> Void = {
      RemoteUserNotificationSoundPlayer.shared.play()
    }
  ) {
    self.deduplicationWindow = deduplicationWindow
    self.bannerDuration = bannerDuration
    self.playSound = playSound
  }

  func setForeground(_ foreground: Bool) {
    isForeground = foreground
    if !foreground { dismiss() }
  }

  /// Returns whether a routed APNs notification should use the system foreground
  /// presentation. Recording the push also prevents a racing socket event from
  /// creating a second banner for the same route.
  func shouldPresentPush(for route: NotificationRoute, now: Date = Date()) -> Bool {
    prune(now: now)
    if recent[route]?.source == .webSocket { return false }
    recent[route] = RecentDelivery(source: .push, receivedAt: now)
    return true
  }

  func receive(
    _ notification: RemoteUserNotificationEvent,
    route: NotificationRoute,
    isReplay: Bool,
    isThreadOpen: Bool,
    deliveryEnabled: Bool = NotificationDeliveryPreference.isEnabled(),
    preference: NotificationAlertPreference = .current(),
    now: Date = Date(),
    schedulesDismiss: Bool = true
  ) {
    guard !isReplay, isForeground, deliveryEnabled,
      preference.foregroundMode == .always,
      preference.allows(notification.category)
    else { return }

    prune(now: now)
    if recent[route]?.source == .push { return }
    // Record even when the thread is already open so the racing generic APNs
    // banner is suppressed just like the focused PWA toast.
    recent[route] = RecentDelivery(source: .webSocket, receivedAt: now)
    guard !isThreadOpen else { return }

    sequence &+= 1
    let next = RemoteNotificationBanner(
      id: sequence,
      route: route,
      notification: notification
    )
    banner = next
    if preference.soundEnabled { playSound() }
    dismissTask?.cancel()
    guard schedulesDismiss else { return }
    dismissTask = Task { [weak self] in
      do {
        try await Task.sleep(for: self?.bannerDuration ?? .seconds(6))
      } catch {
        return
      }
      guard !Task.isCancelled else { return }
      self?.dismiss(id: next.id)
    }
  }

  func dismiss() {
    dismissTask?.cancel()
    dismissTask = nil
    banner = nil
  }

  private func dismiss(id: UInt64) {
    guard banner?.id == id else { return }
    dismiss()
  }

  private func prune(now: Date) {
    recent = recent.filter {
      let age = now.timeIntervalSince($0.value.receivedAt)
      return age >= 0 && age <= deduplicationWindow
    }
  }
}

@MainActor
final class RemoteUserNotificationSoundPlayer {
  static let shared = RemoteUserNotificationSoundPlayer()
  private var player: AVAudioPlayer?

  func play() {
    guard let url = Bundle.main.url(forResource: "notification", withExtension: "mp3") else {
      return
    }
    do {
      let player = try AVAudioPlayer(contentsOf: url)
      player.volume = 0.4
      player.prepareToPlay()
      self.player = player
      player.play()
    } catch {
      // Notification delivery must remain successful when audio is unavailable.
    }
  }
}

extension NotificationAlertPreference {
  fileprivate func allows(_ category: RemoteUserNotificationCategory) -> Bool {
    switch category {
    case .done: doneEnabled
    case .needsAttention: needsAttentionEnabled
    case .error: errorEnabled
    }
  }
}

struct RemoteUserNotificationBannerView: View {
  let banner: RemoteNotificationBanner
  let open: () -> Void
  let dismiss: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(spacing: 12) {
        Image(systemName: symbolName)
          .font(.body.weight(.semibold))
          .foregroundStyle(tint)
          .frame(width: 32, height: 32)
          .background(tint.opacity(0.14), in: Circle())
        VStack(alignment: .leading, spacing: 2) {
          Text(banner.notification.projectName)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(banner.notification.threadTitle)
            .font(.footnote)
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(ThreadLifecycleStrings.status(banner.notification.status))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
    .buttonStyle(.plain)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
    .gesture(
      DragGesture(minimumDistance: 12)
        .onEnded { value in
          if value.translation.height < -24 { dismiss() }
        }
    )
    .accessibilityIdentifier("remote-user-notification-banner")
  }

  private var symbolName: String {
    switch banner.notification.category {
    case .done: "checkmark.circle.fill"
    case .needsAttention: "exclamationmark.bubble.fill"
    case .error: "exclamationmark.triangle.fill"
    }
  }

  private var tint: Color {
    switch banner.notification.category {
    case .done: .green
    case .needsAttention: .orange
    case .error: .red
    }
  }
}
