import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct DesktopSessionAttributes: ActivityAttributes {
  struct Routing: Codable, Hashable, Sendable {
    var version: Int
    var clientConnectionId: String
    var desktopId: String
  }

  let desktopId: String
  let desktopName: String
  let routing: Routing?

  init(desktopId: String, desktopName: String, routing: Routing? = nil) {
    self.desktopId = desktopId
    self.desktopName = desktopName
    self.routing = routing
  }

  struct ContentState: Codable, Hashable {
    var runningCount: Int
    var threads: [ThreadRow]

    struct ThreadRow: Codable, Hashable {
      var threadId: String
      var title: String
      var project: String
      var status: String
      var startedAt: Date

      enum CodingKeys: String, CodingKey {
        case threadId, title, project, status, startedAt
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
        startedAt = Date(
          timeIntervalSince1970: try container.decode(Double.self, forKey: .startedAt) / 1000
        )
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
