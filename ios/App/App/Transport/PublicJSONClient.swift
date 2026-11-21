import Foundation

enum PublicJSONFailure: Error { case response, tooLarge }

protocol PublicJSONLoading: Sendable {
  func load() async throws -> Data
}

/// Anonymous, bounded public documents. Deliberately independent of paired-host
/// credentials, TLS pins, cookies and remote-session retry policy.
struct PublicJSONClient: PublicJSONLoading {
  let url: URL
  let maximumBytes: Int
  private let session: URLSession

  init(url: URL, maximumBytes: Int, session: URLSession? = nil) {
    self.url = url
    self.maximumBytes = maximumBytes
    let configuration = session?.configuration ?? .ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.httpAdditionalHeaders = nil
    configuration.timeoutIntervalForResource = 20
    self.session = URLSession(configuration: configuration)
  }

  func load() async throws -> Data {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (bytes, response) = try await session.bytes(for: request)
    defer { bytes.task.cancel() }
    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw PublicJSONFailure.response }
    guard response.expectedContentLength <= maximumBytes else { throw PublicJSONFailure.tooLarge }
    var data = Data()
    if response.expectedContentLength > 0 { data.reserveCapacity(Int(response.expectedContentLength)) }
    for try await byte in bytes {
      guard data.count < maximumBytes else { throw PublicJSONFailure.tooLarge }
      data.append(byte)
    }
    return data
  }
}
