import SwiftUI

/// Native presentation of the shared PWA usage meter semantics. The component
/// keeps labels and quota timing clear of the track while sharing one tone,
/// projection, and pace treatment across every iOS usage surface.
struct SettingsUsageWindowMeter: View {
  let window: SettingsUsageWindow

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    TimelineView(.periodic(from: .now, by: 60)) { timeline in
      meter(now: timeline.date)
    }
  }

  private func meter(now: Date) -> some View {
    let projection = SettingsUsagePresentation.projection(for: window, now: now)
    let pace = SettingsUsagePresentation.pace(for: window, now: now)
    let reset = SettingsUsagePresentation.resetCountdown(window.resetsAt, now: now)
    let secondary = SettingsUsagePresentation.windowSecondaryValue(window)
    let details = [reset, secondary].compactMap { $0 }.joined(separator: " · ")

    return VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text(window.label)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer(minLength: 0)
        HStack(spacing: 0) {
          if !details.isEmpty {
            Text("\(details) · ")
              .foregroundStyle(.secondary)
          }
          Text(SettingsUsagePresentation.windowValue(window))
            .foregroundStyle(.primary)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .monospacedDigit()
      }
      .font(.footnote)

      SettingsUsageBarTrack(
        usedPercent: window.usedPercent,
        projection: projection
      )

      if let pace {
        HStack(spacing: 6) {
          Circle()
            .fill(pace.tone.color(in: colorScheme))
            .frame(width: 4, height: 4)
          Text(pace.text)
            .lineLimit(1)
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct SettingsUsageBarTrack: View {
  let usedPercent: Double
  let projection: SettingsUsageProjection?

  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    GeometryReader { geometry in
      let used = min(max(usedPercent, 0), 100) / 100
      let projected = min(max(projection?.projectedPercent ?? usedPercent, 0), 100) / 100
      let hasTrajectory = projected - used > 0.005
      let showMarker = hasTrajectory && projection?.lastsToReset == true && projected < 0.995
      let projectedTone = SettingsUsagePresentation.tone(for: projection?.projectedPercent)

      ZStack(alignment: .leading) {
        Capsule().fill(Color(uiColor: .separator).opacity(0.58))
        if hasTrajectory {
          Rectangle()
            .fill(projectedTone.color(in: colorScheme).opacity(0.12))
            .frame(width: geometry.size.width * (projected - used))
            .offset(x: geometry.size.width * used)
        }
        Rectangle()
          .fill(SettingsUsagePresentation.tone(for: usedPercent).color(in: colorScheme))
          .frame(width: geometry.size.width * used)
        if showMarker {
          Rectangle()
            .fill(projectedTone.color(in: colorScheme).opacity(0.55))
            .frame(width: 1)
            .offset(x: geometry.size.width * projected - 0.5)
        }
      }
      .clipShape(Capsule())
    }
    .frame(height: 6)
    .accessibilityHidden(true)
  }
}

extension SettingsUsageTone {
  func color(in colorScheme: ColorScheme) -> Color {
    switch self {
    case .normal: colorScheme == .light ? .secondary : .primary
    case .warning: .orange
    case .danger: .red
    case .unknown: .secondary
    }
  }
}
