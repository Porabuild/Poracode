import ActivityKit
import SwiftUI
import WidgetKit

/// Live Activity for a paired desktop session. One activity per desktop; its
/// content state carries the running count plus the top ~3 threads.
@available(iOS 16.2, *)
struct DesktopSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DesktopSessionAttributes.self) { context in
            // Lock screen / banner presentation.
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "terminal.fill")
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let top = context.state.topThreads.first {
                        ElapsedText(startedAt: top.startedAt)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    if let top = context.state.topThreads.first {
                        VStack(spacing: 2) {
                            Text(top.title)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                            HStack(spacing: 4) {
                                StatusDot(status: top.status)
                                Text(ThreadStatusDisplay.label(for: top.status))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        Text(context.attributes.desktopName)
                            .font(.caption)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    let rest = Array(context.state.topThreads.dropFirst())
                    if !rest.isEmpty {
                        VStack(spacing: 4) {
                            ForEach(rest, id: \.threadId) { thread in
                                ThreadRowView(thread: thread, attributes: context.attributes)
                            }
                        }
                    }
                }
            } compactLeading: {
                CompactActivityLink(context: context) {
                    Image(systemName: "terminal.fill")
                        .foregroundStyle(.secondary)
                }
            } compactTrailing: {
                CompactActivityLink(context: context) {
                    StatusDot(status: context.state.primaryStatus)
                }
            } minimal: {
                CompactActivityLink(context: context) {
                    StatusDot(status: context.state.primaryStatus)
                }
            }
        }
    }
}

@available(iOS 16.2, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<DesktopSessionAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "terminal.fill")
                    .foregroundStyle(.secondary)
                Text(context.attributes.desktopName)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Text(ThreadStatusDisplay.runningCount(context.state.runningCount))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(context.state.topThreads, id: \.threadId) { thread in
                ThreadRowView(thread: thread, attributes: context.attributes)
            }
        }
        .padding()
    }
}

@available(iOS 16.2, *)
private struct ThreadRowView: View {
    let thread: DesktopSessionAttributes.ContentState.ThreadRow
    let attributes: DesktopSessionAttributes

    var body: some View {
        if let destination = attributes.destinationURL(threadId: thread.threadId) {
            Link(destination: destination) { row }
                .buttonStyle(.plain)
        } else {
            row
        }
    }

    private var row: some View {
        HStack(spacing: 8) {
            StatusDot(status: thread.status)
            VStack(alignment: .leading, spacing: 2) {
                Text(thread.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(thread.project)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                ElapsedText(startedAt: thread.startedAt)
                Text(ThreadStatusDisplay.label(for: thread.status))
                    .font(.caption2)
                    .foregroundStyle(ThreadStatusDisplay.color(for: thread.status))
            }
        }
    }
}

@available(iOS 16.2, *)
private struct CompactActivityLink<Content: View>: View {
    let context: ActivityViewContext<DesktopSessionAttributes>
    let content: Content

    init(
        context: ActivityViewContext<DesktopSessionAttributes>,
        @ViewBuilder content: () -> Content
    ) {
        self.context = context
        self.content = content()
    }

    var body: some View {
        if let thread = context.state.topThreads.first,
           let destination = context.attributes.destinationURL(threadId: thread.threadId)
        {
            Link(destination: destination) { content }
        } else {
            content
        }
    }
}

@available(iOS 16.2, *)
private extension DesktopSessionAttributes {
    func destinationURL(threadId: String) -> URL? {
        guard let routing, routing.version == 1 else { return nil }
        var components = URLComponents()
        components.scheme = "poracode"
        components.host = "notification"
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let values = [
            ("version", String(routing.version)),
            ("clientConnectionId", routing.clientConnectionId),
            ("desktopId", routing.desktopId),
            ("threadId", threadId),
        ]
        components.percentEncodedQuery = values.map { key, value in
            "\(key)=\(value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")"
        }.joined(separator: "&")
        return components.url
    }
}

/// Self-updating elapsed timer counting up from the thread start.
private struct ElapsedText: View {
    let startedAt: Date

    var body: some View {
        Text(timerInterval: startedAt...Date.distantFuture, countsDown: false)
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(maxWidth: 56, alignment: .trailing)
    }
}

private struct StatusDot: View {
    let status: String

    var body: some View {
        Circle()
            .fill(ThreadStatusDisplay.color(for: status))
            .frame(width: 8, height: 8)
    }
}
