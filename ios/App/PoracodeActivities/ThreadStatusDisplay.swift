import SwiftUI

/// Maps the provider-agnostic thread `status` strings (see the TS `ThreadRow`
/// and `src/shared/contracts/common.ts`) to the label + accent shown in the
/// Live Activity.
///
/// English-only for now.
/// TODO: iOS localization — move these labels into a String Catalog
/// (`Localizable.xcstrings`) once the widget extension is localized.
enum ThreadStatusDisplay {
    static func label(for status: String) -> String {
        switch status {
        case "working": return "Running"
        case "needs_approval", "needs_reply": return "Needs input"
        case "finished": return "Done"
        case "error": return "Error"
        case "idle": return "Idle"
        default: return "Running"
        }
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
