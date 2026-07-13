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
                                ThreadRowView(thread: thread)
                            }
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "terminal.fill")
                    .foregroundStyle(.secondary)
            } compactTrailing: {
                StatusDot(status: context.state.primaryStatus)
            } minimal: {
                StatusDot(status: context.state.primaryStatus)
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
                Text("\(context.state.runningCount) running")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            ForEach(context.state.topThreads, id: \.threadId) { thread in
                ThreadRowView(thread: thread)
            }
        }
        .padding()
    }
}

@available(iOS 16.2, *)
private struct ThreadRowView: View {
    let thread: DesktopSessionAttributes.ContentState.ThreadRow

    var body: some View {
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
