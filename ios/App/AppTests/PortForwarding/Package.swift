// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "PortForwardingIsolation",
  defaultLocalization: "en",
  platforms: [.macOS(.v15)],
  products: [
    .library(name: "PortForwarding", targets: ["PortForwarding"])
  ],
  targets: [
    .target(
      name: "PortForwarding",
      path: "PackageSources/PortForwarding",
      exclude: [
        // UIKit presentation is compiled by the App test build. The isolation
        // package runs controller, transport, security, and projection tests on macOS.
        "Feature/PortForwardingSessionComposition.swift",
        "Feature/PortForwardingSessionView.swift",
        "Feature/PortForwardingView.swift",
        "Transport/PortForwardingHostCatalog.swift",
      ],
      resources: [.process("Feature/PortForwarding.xcstrings")],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
    .testTarget(
      name: "PortForwardingTests",
      dependencies: ["PortForwarding"],
      path: ".",
      exclude: ["Fixtures", "PackageSources", "Package.swift"],
      sources: [
        "PortForwardingTestSupport.swift",
        "PortForwardingContractTests.swift",
        "PortForwardingEntryURLTests.swift",
        "PortForwardingHTTPTests.swift",
        "SelectedPortForwardingGatewayTests.swift",
        "PortForwardingControllerTests.swift",
        "PortForwardingSecurityTests.swift",
        "PortForwardingQualityTests.swift",
      ],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
  ]
)
