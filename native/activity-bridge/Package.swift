// swift-tools-version: 5.9
import PackageDescription

// Swift Package Manager path (Capacitor 7/8 SPM plugin layout). Used when the
// generated iOS app is created with `cap add ios --packagemanager SPM`. The
// CocoaPods path (PoracodeActivityBridge.podspec) is used otherwise; both
// point at the same sources under ios/Sources, so either integration works.
let package = Package(
    name: "PoracodeActivityBridge",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "PoracodeActivityBridge",
            targets: ["ActivityBridgePlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "ActivityBridgePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/ActivityBridgePlugin"
        )
    ]
)
