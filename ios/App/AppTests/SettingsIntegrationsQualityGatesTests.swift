import XCTest

@testable import App

@MainActor
final class SettingsIntegrationsQualityGatesTests: XCTestCase {
  func testEveryProductionSwiftFileStaysBelowFiveHundredLines() throws {
    let files = try productionSwiftFiles()
    XCTAssertEqual(files.count, 21)
    for file in files {
      let text = try String(contentsOf: file, encoding: .utf8)
      XCTAssertLessThan(
        text.split(separator: "\n", omittingEmptySubsequences: false).count, 500, file.path)
    }
  }

  func testDedicatedCatalogHasEveryLocaleAndNoEmptyTranslations() throws {
    let root = repositoryRoot()
    let url = root.appendingPathComponent(
      "ios/App/App/Features/SettingsIntegrations/SettingsIntegrations.xcstrings"
    )
    let data = try Data(contentsOf: url)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let strings = try XCTUnwrap(object["strings"] as? [String: Any])
    let expected = Set([
      "en", "de", "es", "fr", "ja", "ko", "pl", "pt-BR", "ru", "tr", "uk", "vi", "zh-Hans",
    ])
    XCTAssertFalse(strings.isEmpty)
    for (key, rawEntry) in strings {
      let entry = try XCTUnwrap(rawEntry as? [String: Any], key)
      let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
      XCTAssertEqual(Set(localizations.keys), expected, key)
      for (locale, rawLocalization) in localizations {
        let localization = try XCTUnwrap(rawLocalization as? [String: Any], "\(key):\(locale)")
        let unit = try XCTUnwrap(localization["stringUnit"] as? [String: Any], "\(key):\(locale)")
        let value = try XCTUnwrap(unit["value"] as? String, "\(key):\(locale)")
        XCTAssertFalse(
          value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "\(key):\(locale)")
      }
    }
  }

  func testEveryDeclaredVisibleStringExistsInDedicatedCatalog() throws {
    let root = repositoryRoot()
    let stringsFile = root.appendingPathComponent(
      "ios/App/App/Features/SettingsIntegrations/UI/SettingsIntegrationsStrings.swift"
    )
    let source = try String(contentsOf: stringsFile, encoding: .utf8)
    let expression = try NSRegularExpression(pattern: #"value\(\"([^\"]+)\"\)"#)
    let range = NSRange(source.startIndex..<source.endIndex, in: source)
    let declared: Set<String> = Set(
      expression.matches(in: source, range: range).compactMap { match -> String? in
        guard let range = Range(match.range(at: 1), in: source) else { return nil }
        return String(source[range])
      })
    let catalogURL = root.appendingPathComponent(
      "ios/App/App/Features/SettingsIntegrations/SettingsIntegrations.xcstrings"
    )
    let data = try Data(contentsOf: catalogURL)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let catalog = try XCTUnwrap(object["strings"] as? [String: Any])
    XCTAssertEqual(declared, Set(catalog.keys))
  }

  func testViewsContainNoRawTextButtonOrLabelStrings() throws {
    let expression = try NSRegularExpression(
      pattern: #"(?:Text|Button|Label|Picker|ContentUnavailableView)\(\s*\""#
    )
    for file in try productionSwiftFiles().filter({ $0.path.contains("/UI/") }) {
      let source = try String(contentsOf: file, encoding: .utf8)
      let range = NSRange(source.startIndex..<source.endIndex, in: source)
      XCTAssertEqual(expression.numberOfMatches(in: source, range: range), 0, file.path)
    }
  }

  func testRealCompositionUsesExactHostGenerationScopesAndRelocatedProject() {
    let session = AppSession(dependencies: .live)
    let connectionID = ClientConnectionID(
      UUID(uuidString: "00000000-0000-4000-8000-000000000071")!
    )
    let profile = ConnectionProfile(
      desktopId: "desktop",
      label: "Profile label",
      httpBaseURL: "https://desktop.example.test",
      wsBaseURL: "wss://desktop.example.test",
      appVersion: "1",
      scopes: ["session:read", "session:operate"],
      pairedAt: Date(timeIntervalSince1970: 0),
      protocolVersion: 3
    )
    session.state.selectedConnectionId = connectionID
    session.state.hosts = [
      HostRecord(
        connectionId: connectionID,
        desktopId: profile.desktopId,
        label: "Registry label",
        httpBaseURL: profile.httpBaseURL,
        wsBaseURL: profile.wsBaseURL,
        appVersion: profile.appVersion,
        scopes: ["session:read"],
        pairedAt: profile.pairedAt,
        protocolVersion: profile.protocolVersion
      )
    ]
    session.state.profile = profile
    session.state.api = RemoteAPIClientBox(
      RemoteAPIClient(endpoint: profile.httpBaseURL, accessToken: "not-rendered")
    )
    session.state.phase = .ready
    session.state.snapshot = snapshot(
      projects: [
        project(id: "posix", name: "Alpha", location: .posix(path: "/first")),
        project(id: "windows", name: "Beta", location: .windows(path: "C:\\work")),
        project(id: "wsl", name: "Gamma", location: SettingsIntegrationsFixtures.wsl),
      ]
    )
    _ = session.state.operationOwner.bumpWorkGeneration()

    let identity = ProjectIdentity(connectionId: connectionID, projectId: "posix")
    var selection = session.currentSettingsIntegrationsSelection(projectIdentity: identity)
    XCTAssertEqual(selection?.hostName, "Registry label")
    XCTAssertEqual(selection?.context.lease.connectionID, connectionID)
    XCTAssertEqual(selection?.context.lease.generation, UInt64(session.state.workGeneration))
    XCTAssertEqual(selection?.context.projectIdentity, identity)
    XCTAssertEqual(selection?.context.projectLocation, .posix(path: "/first"))
    XCTAssertEqual(selection?.access.scopes, [.read])
    XCTAssertTrue(selection?.access.isReady == true)
    XCTAssertEqual(
      session.currentSettingsIntegrationsProjects.map(\.id.projectId),
      [
        "posix", "windows", "wsl",
      ])
    XCTAssertEqual(
      session.currentSettingsIntegrationsSelection(
        projectIdentity: ProjectIdentity(connectionId: connectionID, projectId: "windows")
      )?.context.projectLocation,
      .windows(path: "C:\\work")
    )
    XCTAssertEqual(
      session.currentSettingsIntegrationsSelection(
        projectIdentity: ProjectIdentity(connectionId: connectionID, projectId: "wsl")
      )?.context.projectLocation,
      SettingsIntegrationsFixtures.wsl
    )

    session.state.snapshot = snapshot(projects: [
      project(
        id: "posix",
        name: "Alpha",
        location: .wsl(
          distro: "Debian",
          linuxPath: "/srv/relocated",
          uncPath: "\\\\wsl.localhost\\Debian\\srv\\relocated",
          remoteServerId: "relocated"
        )
      )
    ])
    selection = session.currentSettingsIntegrationsSelection(projectIdentity: identity)
    XCTAssertEqual(selection?.context.projectIdentity, identity)
    XCTAssertEqual(selection?.context.projectLocation?.distro, "Debian")
    XCTAssertEqual(selection?.context.projectLocation?.linuxPath, "/srv/relocated")
    XCTAssertEqual(
      selection?.context.projectLocation?.uncPath,
      "\\\\wsl.localhost\\Debian\\srv\\relocated"
    )

    _ = session.state.operationOwner.bumpWorkGeneration()
    XCTAssertNotEqual(
      selection?.context.lease.generation,
      session.currentSettingsIntegrationsSelection(projectIdentity: identity)?.context.lease
        .generation
    )
    session.state.selectedConnectionId = ClientConnectionID()
    XCTAssertNil(session.currentSettingsIntegrationsSelection(projectIdentity: identity))
    XCTAssertTrue(session.currentSettingsIntegrationsProjects.isEmpty)
  }

  func testSettingsNavigationUsesLocalizedValueLinksAndSystemBackStack() throws {
    XCTAssertFalse(SettingsIntegrationsStrings.title.isEmpty)
    XCTAssertEqual(Set(SettingsIntegrationsScreen.Route.allCases), [.skills, .mcp])

    let root = repositoryRoot()
    let settingsSource = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/Settings/UI/SettingsHostView.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(settingsSource.contains("SettingsIntegrationsSessionView(session: session)"))
    XCTAssertTrue(settingsSource.contains("SettingsIntegrationsStrings.title"))

    let integrationsSource = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/SettingsIntegrations/UI/SettingsIntegrationsScreen.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(integrationsSource.contains("NavigationLink(value: item)"))
    XCTAssertFalse(integrationsSource.contains("dismiss()"))

    let compositionSource = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/SettingsIntegrations/UI/SettingsIntegrationsSessionComposition.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(compositionSource.contains("if requiredProjectIdentity == nil"))
    XCTAssertTrue(compositionSource.contains("HostSelectionMenu(session: session)"))
    XCTAssertTrue(compositionSource.contains("configuredMCPServers"))
    XCTAssertTrue(compositionSource.contains("onImportMCPServer"))
    XCTAssertTrue(compositionSource.contains("onUpdateMCPServer"))

    let mcpSource = try String(
      contentsOf: root.appendingPathComponent(
        "ios/App/App/Features/SettingsIntegrations/UI/SettingsMCPView.swift"
      ),
      encoding: .utf8
    )
    XCTAssertTrue(mcpSource.contains("if let onImport"))
    XCTAssertTrue(mcpSource.contains("SettingsIntegrationsStrings.configured"))
    XCTAssertTrue(mcpSource.contains("SettingsIntegrationsStrings.importSkill"))
    XCTAssertTrue(mcpSource.contains("replacingDisabledTools"))
  }

  private func project(
    id: String,
    name: String,
    location: ProjectLocation
  ) -> RemoteProject {
    RemoteProject(
      id: id,
      remoteServerId: nil,
      remoteId: nil,
      name: name,
      location: location,
      workspaceId: nil,
      disabled: false,
      createdAt: "2026-08-12T00:00:00Z"
    )
  }

  private func snapshot(projects: [RemoteProject]) -> RemoteShellSnapshot {
    RemoteShellSnapshot(
      snapshotSeq: 1,
      projects: projects,
      threads: [],
      runtimeSummariesByThread: [:],
      updatedAt: "2026-08-12T00:00:00Z"
    )
  }

  private func productionSwiftFiles() throws -> [URL] {
    let base = repositoryRoot().appendingPathComponent("ios/App/App")
    let paths = ["Models", "Protocol", "Transport", "Features"].map {
      base.appendingPathComponent($0).appendingPathComponent("SettingsIntegrations")
    }
    return try paths.flatMap { directory in
      let files = try FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
      )
      return try files.flatMap { file -> [URL] in
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory)
        if isDirectory.boolValue {
          return try FileManager.default.contentsOfDirectory(
            at: file, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
          ).filter { $0.pathExtension == "swift" }
        }
        return file.pathExtension == "swift" ? [file] : []
      }
    }
  }

  private func repositoryRoot() -> URL {
    if let override = ProcessInfo.processInfo.environment["PORACODE_REPOSITORY_ROOT"] {
      return URL(fileURLWithPath: override)
    }
    var candidate = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    while candidate.path != "/" {
      if FileManager.default.fileExists(atPath: candidate.appendingPathComponent(".git").path) {
        return candidate
      }
      candidate.deleteLastPathComponent()
    }
    return candidate
  }
}
