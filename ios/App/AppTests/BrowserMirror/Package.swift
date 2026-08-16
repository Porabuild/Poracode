// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "BrowserMirrorIsolation",
  defaultLocalization: "en",
  platforms: [.macOS(.v15)],
  products: [
    .library(name: "BrowserMirror", targets: ["BrowserMirror"])
  ],
  targets: [
    .target(
      name: "BrowserMirror",
      path: "PackageSources/BrowserMirror",
      // Files that bind the feature to the host app (session, catalog, shared socket) are
      // excluded so this harness keeps compiling the portable core on its own.
      exclude: [
        "Feature/BrowserMirrorComposition.swift",
        "Feature/BrowserMirrorSessionView.swift",
        "Transport/BrowserMirrorHostTransportSource.swift",
        "Transport/BrowserMirrorSessionSocket.swift",
        "Transport/RemoteWebSocketClient+BrowserMirror.swift",
      ],
      resources: [.process("Feature/BrowserMirror.xcstrings")],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
    .testTarget(
      name: "BrowserMirrorTests",
      dependencies: ["BrowserMirror"],
      path: ".",
      exclude: ["PackageSources", "Package.swift"],
      sources: [
        "BrowserMirrorTestSupport.swift",
        "BrowserMirrorContractTests.swift",
        "BrowserMirrorHTTPTests.swift",
        "BrowserMirrorControllerTests.swift",
        "BrowserMirrorInputGeometryTests.swift",
        "BrowserMirrorQualityTests.swift",
      ],
      swiftSettings: [
        .swiftLanguageMode(.v6),
        .unsafeFlags(["-strict-concurrency=complete"]),
      ]
    ),
  ]
)
