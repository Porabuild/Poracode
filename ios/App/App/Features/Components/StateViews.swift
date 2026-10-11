import SwiftUI

enum StateViewStrings {
  static let loading = String(localized: "common.state.loading", defaultValue: "Loading…")
  static let errorTitle = String(
    localized: "common.error.title", defaultValue: "Something went wrong"
  )
  static let retry = String(localized: "common.action.retry", defaultValue: "Try Again")
}

struct LoadingStateView: View {
    var message: String = StateViewStrings.loading

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.large)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message)
    }
}

struct EmptyStateView: View {
    let title: String
    var systemImage: String = "tray"
    var description: String?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let description {
                Text(description)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ErrorStateView: View {
    let message: String
    var retryTitle: String = StateViewStrings.retry
    var retry: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(StateViewStrings.errorTitle, systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            if let retry {
                Button(retryTitle, action: retry)
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel(retryTitle)
            }
        }
    }
}

struct SocketStatusBadge: View {
    let state: RemoteWebSocketClient.ConnectionState

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Connection \(label)")
    }

    private var label: String {
        switch state {
        case .idle: return "Idle"
        case .connecting: return "Connecting"
        case .online: return "Live"
        case .reconnecting: return "Reconnecting"
        case .suspended: return "Paused"
        case .failed: return "Offline"
        }
    }

    private var color: Color {
        switch state {
        case .online: return .green
        case .connecting, .reconnecting: return .orange
        case .failed: return .red
        case .idle, .suspended: return .secondary
        }
    }
}
