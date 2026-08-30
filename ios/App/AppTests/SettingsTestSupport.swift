import Foundation
import XCTest

@testable import App

enum SettingsFixtures {
  static func data(_ object: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }

  static var agentStatuses: [String: Any] {
    [
      "windows": [
        [
          "kind": "codex", "label": "Codex", "installed": true,
          "authState": "authenticated", "capabilities": [:],
        ]
      ],
      "wsl": [],
      "updatedAt": "2026-08-12T12:00:00Z",
    ]
  }

  static var providerUsage: [String: Any] {
    [
      "snapshots": [
        [
          "providerId": "codex", "status": "ok", "windows": [],
          "fetchedAt": 1_765_000_000_000 as Int64,
        ]
      ],
      "fromCache": false,
    ]
  }

  static var device: [String: Any] {
    [
      "id": "device-1", "label": "Mac", "platform": "darwin", "isCurrent": true,
    ]
  }

  static var profileDevices: [String: Any] {
    [
      "devices": [device], "currentDeviceId": "device-1",
    ]
  }

  static var identity: [String: Any] {
    [
      "name": "Ada", "handle": "ada", "avatarColor": "#123456", "plan": "Local",
    ]
  }

  static var profileIdentity: [String: Any] { ["identity": identity, "device": device] }

  static var heatmap: [String: Any] {
    [
      "metric": "prompts", "windowDays": 7, "cells": [], "max": 0,
    ]
  }

  static var profileCore: [String: Any] {
    [
      "scope": "device", "device": device, "generatedAt": 1_765_000_000_000 as Int64,
      "timezoneOffsetMinutes": -420, "identity": identity,
      "totals": [
        "totalThreads": 0, "totalPrompts": 0, "messagesSent": 0, "goalsSet": 0,
        "longestTaskMs": 0, "currentStreakDays": 0, "longestStreakDays": 0,
        "activeDays": 0,
      ],
      "promptHeatmap": heatmap,
      "insights": [
        "fastModePercent": 0, "skillsExplored": 0, "totalSkillsUsed": 0,
        "workflowRuns": 0, "subagentRuns": 0, "mcpToolCalls": 0,
      ],
      "providers": [], "accounts": [], "models": [], "modes": [], "skills": [],
      "mcps": [], "aiActions": [], "availableAccounts": [],
    ]
  }

  static var profileTokens: [String: Any] {
    [
      "available": false, "scope": "device", "device": device,
      "generatedAt": 1_765_000_000_000 as Int64, "timezoneOffsetMinutes": -420,
      "windowDays": 7, "lifetimeTokens": 0, "peakDayTokens": 0,
      "providers": [], "accounts": [], "models": [],
      "tokenHeatmap": ["metric": "tokens", "windowDays": 7, "cells": [], "max": 0],
      "unavailableProviders": [],
    ]
  }

  static var settings: [String: Any] {
    [
      "agentSettings": ["cursor": ["structuredRuntime": "acp"]],
      "hiddenModels": [:], "disabledAgents": [], "providerOrder": [],
      "usage": [
        "autoRefresh": true, "refreshIntervalMinutes": 5,
        "providerRefreshIntervals": [:], "showEstimatedCost": false,
        "showInSidebar": true, "sidebarHiddenProviders": [],
        "disabledProviders": [], "providerOrder": ["codex"],
        "collapsedProviders": [], "selectedRingGroups": [:],
      ],
      "enabledMcpServers": [:], "disabledBuiltInMcpServers": [:],
      "titleGenProvider": "codex", "titleGenModel": "model", "titleGenEffort": "medium",
      "titleGenFast": false,
      "commitGenProvider": "codex", "commitGenModel": "model", "commitGenEffort": "medium",
      "commitGenFast": false,
      "conflictResolverProvider": "codex", "conflictResolverModel": "model",
      "conflictResolverEffort": "medium", "conflictResolverFast": false,
      "conflictResolverPresentationMode": "terminal",
      "wslTitleGenProvider": "codex", "wslTitleGenModel": "model",
      "wslTitleGenEffort": "medium", "wslTitleGenFast": false,
      "wslCommitGenProvider": "codex", "wslCommitGenModel": "model",
      "wslCommitGenEffort": "medium", "wslCommitGenFast": false,
      "wslConflictResolverProvider": "codex", "wslConflictResolverModel": "model",
      "wslConflictResolverEffort": "medium", "wslConflictResolverFast": false,
      "wslConflictResolverPresentationMode": "terminal",
      "worktreeStorageMode": "global", "worktreeBasePath": "",
      "wslWorktreeBasePath": "", "searchUseIgnoreFiles": false,
      "searchExclude": ["**/node_modules": true, "**/generated": true],
      "prAutomationDefault": "off", "prMergeMethod": "merge",
    ]
  }

  static var settingsResponse: [String: Any] { ["settings": settings] }
}

final class SettingsURLProtocol: URLProtocol, @unchecked Sendable {
  struct Reply: Sendable {
    let status: Int
    let body: Data
  }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var replies: [Reply] = []
  nonisolated(unsafe) private static var captured: [URLRequest] = []
  nonisolated(unsafe) private static var capturedBodies: [Data?] = []
  nonisolated(unsafe) private static var starts = 0

  static func reset() {
    lock.withLock {
      replies = []
      captured = []
      capturedBodies = []
      starts = 0
    }
  }

  static func enqueue(_ object: Any, status: Int = 200) throws {
    let reply = Reply(status: status, body: try SettingsFixtures.data(object))
    lock.withLock { replies.append(reply) }
  }

  static var requests: [URLRequest] { lock.withLock { captured } }
  static var bodies: [Data?] { lock.withLock { capturedBodies } }
  static var requestCount: Int { lock.withLock { starts } }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let reply: Reply? = Self.lock.withLock {
      Self.starts += 1
      Self.captured.append(request)
      Self.capturedBodies.append(Self.body(from: request))
      return Self.replies.isEmpty ? nil : Self.replies.removeFirst()
    }
    guard let reply, let url = request.url,
      let response = HTTPURLResponse(
        url: url, statusCode: reply.status, httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": "application/json"]
      )
    else {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
      return
    }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: reply.body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func body(from request: URLRequest) -> Data? {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return nil }
    stream.open()
    defer { stream.close() }
    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
    defer { buffer.deallocate() }
    while true {
      let count = stream.read(buffer, maxLength: 4_096)
      if count <= 0 { return data.isEmpty ? nil : data }
      data.append(buffer, count: count)
    }
  }
}

func makeSettingsClient() -> RemoteAPIClient {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [SettingsURLProtocol.self]
  return RemoteAPIClient(
    endpoint: "https://host.example/prefix", accessToken: "host-token",
    session: URLSession(configuration: configuration)
  )
}

func settingsLease(_ suffix: String = "1", generation: UInt64 = 1) -> SettingsHostLease {
  let uuid = UUID(uuidString: "00000000-0000-4000-8000-00000000000\(suffix)")!
  return SettingsHostLease(connectionID: ClientConnectionID(uuid), generation: generation)
}
