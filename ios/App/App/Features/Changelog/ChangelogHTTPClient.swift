import Foundation

protocol ChangelogLoading: Sendable {
  func load() async throws -> ChangelogDocument
}

struct ChangelogHTTPClient: ChangelogLoading {
  static let feedURL = URL(string: "https://poracode.com/changelog.json")!
  static let releasesURL = URL(string: "https://github.com/Porabuild/Poracode/releases")!
  let url: URL
  private let client: PublicJSONClient

  init(url: URL = Self.feedURL, session: URLSession? = nil) {
    self.url = url
    client = PublicJSONClient(url: url, maximumBytes: ChangelogDocument.maximumBytes, session: session)
  }

  func load() async throws -> ChangelogDocument {
    do {
      return try ChangelogDocument.parse(await client.load())
    } catch PublicJSONFailure.response {
      throw ChangelogFailure.response
    } catch PublicJSONFailure.tooLarge {
      throw ChangelogFailure.invalidDocument
    }
  }

  static func makeDefault() -> Self {
    #if DEBUG && targetEnvironment(simulator)
    // A controlled public-feed server for native UI journeys. Release builds
    // always use the publisher URL and never accept a paired-host override.
    if ProcessInfo.processInfo.arguments.contains("-native-e2e-fresh-state"),
      let value = ProcessInfo.processInfo.environment["NATIVE_E2E_CHANGELOG_URL"],
      let url = URL(string: value), url.scheme == "http", url.host == "127.0.0.1",
      url.user == nil, url.password == nil {
      return Self(url: url)
    }
    #endif
    return Self()
  }
}
