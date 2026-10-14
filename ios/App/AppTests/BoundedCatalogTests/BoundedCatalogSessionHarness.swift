import Foundation
import XCTest

@testable import App

// MARK: - Session harness

@MainActor
struct BoundedCatalogSessionHarness {
  let session: AppSession
  let fixture: BoundedCatalogHostFixture

  static func make(
    fixture: BoundedCatalogHostFixture,
    threadCount: Int = 0,
    projectCount: Int = 0,
    configurePolicy: (BoundedCatalogPolicy) -> BoundedCatalogPolicy = { $0 }
  ) async throws -> BoundedCatalogSessionHarness {
    var threads: [BoundedCatalogHostFixture.ThreadSeed] = []
    for index in 0 ..< threadCount {
      let id = String(format: "t%05d", index)
      threads.append(
        .make(
          id: id,
          projectId: String(format: "p%04d", index % max(1, projectCount)),
          updatedAt: String(format: "2026-01-01T00:00:%02d.000Z", index % 60)
        )
      )
    }
    if threadCount > 0 { fixture.setThreads(threads) }
    if projectCount > 0 {
      fixture.setProjects(
        (0 ..< projectCount).map { .make(id: String(format: "p%04d", $0)) }
      )
    }
    BoundedCatalogURLProtocol.install(fixture)

    let profile = makeProfile(endpoint: "https://a.test")
    let (session, _, _) = try await makeSession(
      seedProfile: profile,
      seedToken: "token-1",
      apiFactory: { endpoint, token in
        RemoteAPIClientBox(
          RemoteAPIClient(
            endpoint: endpoint,
            accessToken: token,
            session: BoundedCatalogURLProtocol.makeSession()
          )
        )
      }
    )
    session.state.catalog.policy = configurePolicy(session.state.catalog.policy)
    await session.bootstrap()
    return BoundedCatalogSessionHarness(session: session, fixture: fixture)
  }

  func waitUntil(
    _ description: String,
    timeout: TimeInterval = 5,
    diagnostics: (@MainActor () -> String)? = nil,
    _ predicate: @MainActor () -> Bool
  ) async {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if predicate() { return }
      try? await Task.sleep(for: .milliseconds(10))
    }
    let detail = diagnostics.map { " | \($0())" } ?? ""
    XCTFail("Timed out waiting for: \(description)\(detail)")
  }
}
