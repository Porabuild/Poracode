import Foundation

struct BrowserMirrorConnectionID: RawRepresentable, Codable, Equatable, Hashable, Sendable {
  let rawValue: String
}

struct BrowserMirrorHostLease: Equatable, Hashable, Sendable {
  let connectionID: BrowserMirrorConnectionID
  let connectionGeneration: UInt64
}

enum BrowserMirrorCapability: String, CaseIterable, Hashable, Sendable {
  case read = "session:read"
  case operate = "session:operate"
}

struct BrowserMirrorHostAccess: Equatable, Sendable {
  let lease: BrowserMirrorHostLease
  let protocolVersion: Int
  let isOnline: Bool
  let isReady: Bool
  let isForeground: Bool
  let capabilities: Set<BrowserMirrorCapability>
  /// Desktop identity the selection was resolved against. When present, resolved
  /// credentials must belong to the same desktop or the work is treated as stale.
  var expectedDesktopID: String?
}

struct BrowserMirrorHostCredentials: Sendable {
  let connectionID: BrowserMirrorConnectionID
  let endpoint: String
  let token: String
  let protocolVersion: Int
  let scopes: Set<String>
  var desktopID: String?
}

struct BrowserMirrorTab: Codable, Equatable, Identifiable, Sendable {
  var id: String { tabId }

  let tabId: String
  let url: String
  let title: String
  let faviconUrl: String?
  let loading: Bool
  let canGoBack: Bool
  let canGoForward: Bool
}

struct BrowserMirrorState: Codable, Equatable, Sendable {
  let tabs: [BrowserMirrorTab]
  let activeTabId: String?

  static let empty = BrowserMirrorState(tabs: [], activeTabId: nil)

  var activeTab: BrowserMirrorTab? {
    guard let activeTabId else { return nil }
    return tabs.first { $0.tabId == activeTabId }
  }
}

enum BrowserMirrorMovePosition: String, Codable, CaseIterable, Sendable {
  case before
  case after
}

enum BrowserMirrorCommand: Equatable, Sendable {
  case createTab(url: String?)
  case closeTab(tabId: String)
  case activateTab(tabId: String)
  case moveTab(
    tabId: String,
    targetTabId: String,
    position: BrowserMirrorMovePosition
  )
  case navigate(tabId: String, url: String)
  case back(tabId: String)
  case forward(tabId: String)
  case reload(tabId: String)

  static let kindCount = 8
}

extension BrowserMirrorCommand: Codable {
  private enum CodingKeys: String, CodingKey {
    case kind
    case url
    case tabId
    case targetTabId
    case position
  }

  private enum Kind: String, Codable {
    case createTab = "create-tab"
    case closeTab = "close-tab"
    case activateTab = "activate-tab"
    case moveTab = "move-tab"
    case navigate
    case back
    case forward
    case reload
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    switch try values.decode(Kind.self, forKey: .kind) {
    case .createTab:
      self = .createTab(url: try values.decodeIfPresent(String.self, forKey: .url))
    case .closeTab:
      self = .closeTab(tabId: try values.decode(String.self, forKey: .tabId))
    case .activateTab:
      self = .activateTab(tabId: try values.decode(String.self, forKey: .tabId))
    case .moveTab:
      self = .moveTab(
        tabId: try values.decode(String.self, forKey: .tabId),
        targetTabId: try values.decode(String.self, forKey: .targetTabId),
        position: try values.decode(BrowserMirrorMovePosition.self, forKey: .position)
      )
    case .navigate:
      self = .navigate(
        tabId: try values.decode(String.self, forKey: .tabId),
        url: try values.decode(String.self, forKey: .url)
      )
    case .back:
      self = .back(tabId: try values.decode(String.self, forKey: .tabId))
    case .forward:
      self = .forward(tabId: try values.decode(String.self, forKey: .tabId))
    case .reload:
      self = .reload(tabId: try values.decode(String.self, forKey: .tabId))
    }
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .createTab(let url):
      try values.encode(Kind.createTab, forKey: .kind)
      try values.encodeIfPresent(url, forKey: .url)
    case .closeTab(let tabId):
      try values.encode(Kind.closeTab, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
    case .activateTab(let tabId):
      try values.encode(Kind.activateTab, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
    case .moveTab(let tabId, let targetTabId, let position):
      try values.encode(Kind.moveTab, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
      try values.encode(targetTabId, forKey: .targetTabId)
      try values.encode(position, forKey: .position)
    case .navigate(let tabId, let url):
      try values.encode(Kind.navigate, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
      try values.encode(url, forKey: .url)
    case .back(let tabId):
      try values.encode(Kind.back, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
    case .forward(let tabId):
      try values.encode(Kind.forward, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
    case .reload(let tabId):
      try values.encode(Kind.reload, forKey: .kind)
      try values.encode(tabId, forKey: .tabId)
    }
  }
}

struct BrowserMirrorFrameMetadata: Codable, Equatable, Sendable {
  let deviceWidth: Double
  let deviceHeight: Double
  let pageScaleFactor: Double
  let offsetTop: Double
  let scrollOffsetX: Double
  let scrollOffsetY: Double
}

struct BrowserMirrorFrame: Equatable, Sendable {
  let tabId: String
  let jpegData: Data
  let metadata: BrowserMirrorFrameMetadata
}

enum BrowserMirrorStatus: Equatable, Sendable {
  case starting(tabId: String?)
  case active(tabId: String?)
  case unavailable
}

enum BrowserMirrorSocketEvent: Equatable, Sendable {
  case state(BrowserMirrorState)
  case frame(BrowserMirrorFrame)
  case status(BrowserMirrorStatus)
}

enum BrowserMirrorUnavailableReason: Equatable, Sendable {
  case offline
  case notReady
  case background
}

enum BrowserMirrorFailure: Error, Equatable, Sendable {
  case unavailable(BrowserMirrorUnavailableReason)
  case protocolIncompatible
  case missingScope
  case invalidRequest
  case invalidResponse
  case rejected(statusCode: Int, code: String?)
  case transport
  case ambiguousMutation
}

/// Outcome of the most recent mutating command. A mutation is attempted exactly once;
/// an ambiguous attempt is resolved by one authoritative read, never by a replay.
enum BrowserMirrorMutationOutcome: Equatable, Sendable {
  case none
  case ambiguousResolved
  case ambiguousUnresolved
}

enum BrowserMirrorLoadState: Equatable, Sendable {
  case idle
  case loading
  case ready
  case unavailable
  case failed(BrowserMirrorFailure)
}
