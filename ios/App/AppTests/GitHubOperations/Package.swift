// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "GitHubOperationsIsolation",
  platforms: [.macOS(.v15)],
  products: [
    .library(name: "GitHubOperations", targets: ["GitHubOperations"])
  ],
  targets: [
    .target(
      name: "GitHubOperations",
      path: "PackageSources/GitHubOperations",
      exclude: [
        "Feature/GitHubOperationForm.swift",
        "Feature/GitHubOperationsControllerSuite.swift",
        "Feature/GitHubOperationsPanel.swift",
        "Transport/GitHubOperationsHostTransportSource.swift",
      ],
      resources: [.process("Feature/GitHubOperations.xcstrings")],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
    .testTarget(
      name: "GitHubOperationsTests",
      dependencies: ["GitHubOperations"],
      path: ".",
      exclude: ["PackageSources", "Package.swift"],
      sources: [
        "GitHubOperationsTestSupport.swift",
        "GitHubOperationsContractTests.swift",
        "GitHubOperationsTransportTests.swift",
        "GitHubOperationsControllerTests.swift",
        "SelectedGitHubOperationsGatewayTests.swift",
        "GitHubOperationsQualityGatesTests.swift",
      ],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
  ]
)
