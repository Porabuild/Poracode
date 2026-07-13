import ActivityKit
import Foundation

/// Shared ActivityAttributes type for desktop-session Live Activities.
///
/// IMPORTANT: ActivityKit requires the *exact same* `ActivityAttributes` type
/// (same name, same `ContentState` shape) to be compiled into BOTH the app's
/// plugin target and the `PoracodeActivities` widget-extension target. This
/// file is the single source of truth — add it as a shared file reference to
/// the widget extension target (see docs/RELEASE_MOBILE.md), do not copy it.
///
/// The `ContentState` `CodingKeys` and `startedAt` epoch-ms encoding must stay
/// in sync with the TypeScript `ContentState` in `src/definitions.ts` and with
/// the `content-state` payload the push gateway forwards to APNs.
@available(iOS 16.2, *)
struct DesktopSessionAttributes: ActivityAttributes {
    // Fixed at start.
    let desktopId: String
    let desktopName: String

    struct ContentState: Codable, Hashable {
        var runningCount: Int
        var threads: [ThreadRow]

        struct ThreadRow: Codable, Hashable {
            var threadId: String
            var title: String
            var project: String
            /// "working" | "needs_approval" | "needs_reply" | "idle" | "finished" | "error"
            var status: String
            /// Elapsed-timer anchor. Decoded from epoch milliseconds (Double).
            var startedAt: Date

            enum CodingKeys: String, CodingKey {
                case threadId
                case title
                case project
                case status
                case startedAt
            }

            init(threadId: String, title: String, project: String, status: String, startedAt: Date) {
                self.threadId = threadId
                self.title = title
                self.project = project
                self.status = status
                self.startedAt = startedAt
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                threadId = try container.decode(String.self, forKey: .threadId)
                title = try container.decode(String.self, forKey: .title)
                project = try container.decode(String.self, forKey: .project)
                status = try container.decode(String.self, forKey: .status)
                let epochMs = try container.decode(Double.self, forKey: .startedAt)
                startedAt = Date(timeIntervalSince1970: epochMs / 1000)
            }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(threadId, forKey: .threadId)
                try container.encode(title, forKey: .title)
                try container.encode(project, forKey: .project)
                try container.encode(status, forKey: .status)
                try container.encode(startedAt.timeIntervalSince1970 * 1000, forKey: .startedAt)
            }
        }
    }
}
