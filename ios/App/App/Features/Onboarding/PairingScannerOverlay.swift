import SwiftUI

/// Dimmed surround with a clear scan window, accent corner brackets, where-to-look
/// copy, and the inline correction for codes that are not pairing links.
struct PairingScannerViewfinder: View {
  let hint: String
  let notice: String?
  let animatesSweep: Bool

  @State private var sweepsDown = false

  private let alignments: [Alignment] = [.topLeading, .topTrailing, .bottomTrailing, .bottomLeading]

  var body: some View {
    GeometryReader { proxy in
      let side = min(min(proxy.size.width, proxy.size.height) * 0.74, 320)
      let center = CGPoint(x: proxy.size.width / 2, y: proxy.size.height * 0.42)
      ZStack {
        Rectangle()
          .fill(.black.opacity(0.58))
          .pairingScannerCutout {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
              .frame(width: side, height: side)
              .position(x: center.x, y: center.y)
          }
        window(side: side)
          .position(x: center.x, y: center.y)
        caption
          .frame(width: max(proxy.size.width - 48, 180))
          .position(x: proxy.size.width / 2, y: center.y + side / 2 + 64)
      }
    }
    .ignoresSafeArea()
    .onAppear { sweepsDown = animatesSweep }
  }

  private var caption: some View {
    VStack(spacing: 14) {
      if let notice {
        Label {
          Text(notice)
            .font(.footnote.weight(.medium))
            .fixedSize(horizontal: false, vertical: true)
        } icon: {
          Image(systemName: "exclamationmark.triangle.fill")
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
          Color.orange.opacity(0.9),
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .accessibilityLabel(notice)
      }
      Text(hint)
        .font(.subheadline)
        .foregroundStyle(.white.opacity(0.92))
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }
    .animation(.easeInOut(duration: 0.2), value: notice)
  }

  private func window(side: CGFloat) -> some View {
    ZStack {
      RoundedRectangle(cornerRadius: 30, style: .continuous)
        .strokeBorder(.white.opacity(0.28), lineWidth: 1)
      brackets(side: side)
      if animatesSweep {
        sweep(side: side)
      }
    }
    .frame(width: side, height: side)
    .accessibilityHidden(true)
  }

  private func brackets(side: CGFloat) -> some View {
    let length = max(28, side * 0.17)
    return ZStack {
      ForEach(Array(alignments.enumerated()), id: \.offset) { index, alignment in
        PairingScannerCorner()
          .stroke(OnboardingBrand.tile, style: StrokeStyle(lineWidth: 4, lineCap: .round))
          .frame(width: length, height: length)
          .rotationEffect(.degrees(Double(index) * 90))
          .frame(width: side, height: side, alignment: alignment)
      }
    }
  }

  private func sweep(side: CGFloat) -> some View {
    let travel = max(side / 2 - 26, 0)
    return Capsule()
      .fill(
        LinearGradient(
          colors: [.clear, OnboardingBrand.violet, .clear],
          startPoint: .leading,
          endPoint: .trailing
        )
      )
      .frame(width: max(side - 52, 0), height: 3)
      .offset(y: sweepsDown ? travel : -travel)
      .animation(.easeInOut(duration: 1.9).repeatForever(autoreverses: true), value: sweepsDown)
  }
}

/// Top-left corner bracket; rotate by 90° steps for the other three.
struct PairingScannerCorner: Shape {
  func path(in rect: CGRect) -> Path {
    let radius = min(rect.width, rect.height) * 0.55
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
    path.addQuadCurve(
      to: CGPoint(x: rect.minX + radius, y: rect.minY),
      control: CGPoint(x: rect.minX, y: rect.minY)
    )
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    return path
  }
}

/// Copy plus actions for a scanner state that cannot show a preview.
struct PairingScannerGuidance: Equatable {
  let systemImage: String
  let title: String
  let message: String
  let actionTitle: String?
}

/// Dead-end-free failure card: the state's own remedy (when there is one) plus both
/// pairing fallbacks.
struct PairingScannerGuidanceCard: View {
  let guidance: PairingScannerGuidance
  let action: (() -> Void)?
  let usePairingLink: () -> Void
  let useManualEntry: () -> Void

  var body: some View {
    VStack(spacing: 18) {
      Image(systemName: guidance.systemImage)
        .font(.system(size: 34, weight: .semibold))
        .foregroundStyle(OnboardingBrand.tile)
        .accessibilityHidden(true)
      VStack(spacing: 8) {
        Text(guidance.title)
          .font(.title3.weight(.semibold))
          .multilineTextAlignment(.center)
        Text(guidance.message)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
      VStack(spacing: 10) {
        if let action, let actionTitle = guidance.actionTitle {
          Button(actionTitle, action: action)
            .poracodeProminentButtonStyle()
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(actionTitle)
            .accessibilityIdentifier("native-e2e.pair.scan.action")
        }
        Button(OnboardingStrings.scanUsePairingLink, action: usePairingLink)
          .buttonStyle(.bordered)
          .controlSize(.large)
          .frame(maxWidth: .infinity)
          .accessibilityLabel(OnboardingStrings.scanUsePairingLink)
          .accessibilityIdentifier("native-e2e.pair.scan.use-link")
        Button(OnboardingStrings.manualDisclosure, action: useManualEntry)
          .buttonStyle(.borderless)
          .controlSize(.large)
          .frame(maxWidth: .infinity)
          .accessibilityLabel(OnboardingStrings.manualTitle)
          .accessibilityIdentifier("native-e2e.pair.scan.use-manual")
      }
    }
    .padding(24)
    .frame(maxWidth: 420)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
  }
}

extension View {
  /// Punches `shape` out of the receiver — the clear scan window in the dimmed surround.
  fileprivate func pairingScannerCutout<Content: View>(
    @ViewBuilder _ shape: () -> Content
  ) -> some View {
    mask {
      ZStack {
        Rectangle()
        shape().blendMode(.destinationOut)
      }
      .compositingGroup()
    }
  }
}
