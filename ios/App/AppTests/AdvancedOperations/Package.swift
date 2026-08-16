// swift-tools-version: 6.2
import PackageDescription

// Isolated harness for the Advanced Operations feature slice. It is not part
// of the Xcode project and does not change global target membership: it only
// symlinks the real feature, transport, generated bindings, and the two model
// files the feature depends on.
let package = Package(
  name: "AdvancedOperationsIsolation",
  defaultLocalization: "en",
  platforms: [.macOS(.v15)],
  products: [
    .library(name: "AdvancedOperations", targets: ["AdvancedOperations"])
  ],
  targets: [
    .target(
      name: "AdvancedOperations",
      path: "PackageSources/AdvancedOperations",
      resources: [.process("Feature/AdvancedOperations.xcstrings")],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
    .testTarget(
      name: "AdvancedOperationsTests",
      dependencies: ["AdvancedOperations"],
      path: ".",
      exclude: ["PackageSources", "Package.swift"],
      sources: [
        "AdvancedOperationsTestSupport.swift",
        "AdvancedOperationsUITestSupport.swift",
        "AdvancedOperationsContractTests.swift",
        "AdvancedOperationsTransportTests.swift",
        "AdvancedOperationsControllerTests.swift",
        "SelectedAdvancedOperationsGatewayTests.swift",
        "AdvancedOperationsQualityGatesTests.swift",
        "AdvancedOperationsPresentationTests.swift",
        "AdvancedOperationsFormTests.swift",
        "AdvancedOperationsScreenModelTests.swift",
        "AdvancedOperationsOutcomeTests.swift",
        "AdvancedOperationsCatalogTests.swift",
        "AdvancedOperationsSourceGateTests.swift",
      ],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
  ]
)
