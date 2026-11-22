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

  private static let sharedSession: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieAcceptPolicy = .never
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.httpAdditionalHeaders = nil
    configuration.timeoutIntervalForResource = 20
    return URLSession(configuration: configuration)
  }()

  init(url: URL, maximumBytes: Int, session: URLSession? = nil) {
    self.url = url
    self.maximumBytes = maximumBytes
    if let session {
      let configuration = (session.configuration.copy() as? URLSessionConfiguration) ?? .ephemeral
      configuration.httpShouldSetCookies = false
      configuration.httpCookieAcceptPolicy = .never
      configuration.httpCookieStorage = nil
      configuration.urlCredentialStorage = nil
      configuration.urlCache = nil
      configuration.httpAdditionalHeaders = nil
      configuration.timeoutIntervalForResource = 20
      self.session = URLSession(configuration: configuration)
    } else {
      self.session = Self.sharedSession
    }
  }

  func load() async throws -> Data {
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await StreamingHTTPBody.perform(
        session: session,
        request: request,
        maxBytes: maximumBytes,
        resourceTimeout: 20,
        usesPairingPins: false,
        retryableSafeRead: true
      )
    } catch let error as RemoteClientError where error.code == "response_too_large" {
      throw PublicJSONFailure.tooLarge
    }
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw PublicJSONFailure.response
    }
    guard data.count <= maximumBytes else { throw PublicJSONFailure.tooLarge }
    return data
  }
}
