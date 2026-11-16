import Foundation

protocol ChangelogLoading: Sendable {
  func load() async throws -> ChangelogDocument
}

struct ChangelogHTTPClient: ChangelogLoading {
  static let feedURL = URL(string: "https://poracode.com/changelog.json")!
  static let releasesURL = URL(string: "https://github.com/Porabuild/Poracode/releases")!
  let url: URL
  private let session: URLSession

  init(url: URL = Self.feedURL, session: URLSession? = nil) {
    self.url = url
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    // Request timeouts are idle timers; cap the entire public read as well.
    configuration.timeoutIntervalForResource = 20
    self.session = session ?? URLSession(configuration: configuration)
  }

  func load() async throws -> ChangelogDocument {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (bytes, response) = try await session.bytes(for: request)
    defer { bytes.task.cancel() }
    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
    else { throw ChangelogFailure.response }
    guard response.expectedContentLength <= ChangelogDocument.maximumBytes else {
      throw ChangelogFailure.invalidDocument
    }
    var data = Data()
    if response.expectedContentLength > 0 { data.reserveCapacity(Int(response.expectedContentLength)) }
    for try await byte in bytes {
      guard data.count < ChangelogDocument.maximumBytes else { throw ChangelogFailure.invalidDocument }
      data.append(byte)
    }
    return try ChangelogDocument.parse(data)
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
