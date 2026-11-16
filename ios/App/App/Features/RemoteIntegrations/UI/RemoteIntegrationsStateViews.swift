import SwiftUI

struct RemoteIntegrationsUnavailableView: View {
  let failure: RemoteIntegrationsFailure
  var retry: (() -> Void)?

  var body: some View {
    ContentUnavailableView {
      Label(RemoteIntegrationsStrings.unavailable, systemImage: "bolt.horizontal.circle")
    } description: {
      Text(RemoteIntegrationsStrings.failure(failure))
    } actions: {
      if let retry {
        Button(RemoteIntegrationsStrings.retry, action: retry)
          .poracodeGlassButtonStyle()
      }
    }
  }
}

struct RemoteIntegrationsLoadingView: View {
  var body: some View {
    VStack(spacing: 12) {
      ForEach(0..<3, id: \.self) { _ in
        HStack(spacing: 12) {
          RoundedRectangle(cornerRadius: 8)
            .frame(width: 38, height: 38)
          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 4).frame(height: 12)
            RoundedRectangle(cornerRadius: 4).frame(width: 150, height: 9)
          }
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal)
      }
    }
    .redacted(reason: .placeholder)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(RemoteIntegrationsStrings.loading)
  }
}

struct RemoteIntegrationsMutationBanner: View {
  let notice: RemoteIntegrationsMutationNotice?
  let failure: RemoteIntegrationsFailure?
  let dismiss: () -> Void

  var body: some View {
    if let notice {
      banner(
        RemoteIntegrationsStrings.notice(notice),
        systemImage: notice == .saved ? "checkmark.circle" : "arrow.clockwise.circle"
      )
    } else if let failure {
      banner(RemoteIntegrationsStrings.failure(failure), systemImage: "exclamationmark.triangle")
    }
  }

  private func banner(_ message: String, systemImage: String) -> some View {
    HStack(spacing: 12) {
      Label(message, systemImage: systemImage)
        .font(.footnote)
      Spacer(minLength: 8)
      Button(RemoteIntegrationsStrings.dismiss, systemImage: "xmark", action: dismiss)
        .labelStyle(.iconOnly)
        .accessibilityLabel(RemoteIntegrationsStrings.dismiss)
    }
    .padding(12)
    .frame(maxWidth: .infinity)
    .remoteIntegrationsGlassSurface()
    .accessibilityElement(children: .combine)
  }
}

struct RemoteIntegrationsReadOnlyNotice: View {
  var body: some View {
    Label(RemoteIntegrationsStrings.readOnly, systemImage: "lock")
      .font(.footnote)
      .foregroundStyle(.secondary)
      .accessibilityElement(children: .combine)
  }
}

extension View {
  func remoteIntegrationsGlassSurface() -> some View {
    poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}
