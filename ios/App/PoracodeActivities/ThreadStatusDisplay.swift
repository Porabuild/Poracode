import SwiftUI

/// Maps the provider-agnostic thread `status` strings (see the TS `ThreadRow`
/// and `src/shared/contracts/common.ts`) to the label + accent shown in the
/// Live Activity.
///
enum ThreadStatusDisplay {
    static func label(for status: String) -> String {
        switch status {
        case "working": return String(localized: "activity.status.running")
        case "needs_approval", "needs_reply":
            return String(localized: "activity.status.needsInput")
        case "finished": return String(localized: "activity.status.done")
        case "error": return String(localized: "activity.status.error")
        case "idle": return String(localized: "activity.status.idle")
        default: return String(localized: "activity.status.running")
        }
    }

    static func runningCount(_ count: Int) -> String {
        if count == 1 {
            return String(localized: "activity.running.one")
        }
        return String.localizedStringWithFormat(
            String(localized: "activity.running.other"),
            count
        )
    }

    static func color(for status: String) -> Color {
        switch status {
        case "working": return .green
        case "needs_approval", "needs_reply": return .orange
        case "error": return .red
        case "finished", "idle": return .gray
        default: return .gray
        }
    }
}

@available(iOS 16.2, *)
extension DesktopSessionAttributes.ContentState {
    /// The most urgent status across the tracked threads — drives the compact
    /// and minimal Dynamic Island presentations.
    var primaryStatus: String {
        let priority = ["needs_approval", "needs_reply", "error", "working", "finished", "idle"]
        for status in priority where threads.contains(where: { $0.status == status }) {
            return status
        }
        return threads.first?.status ?? "idle"
    }

    /// Top rows to render (content state already carries the top ~3).
    var topThreads: [ThreadRow] {
        Array(threads.prefix(3))
    }
}
