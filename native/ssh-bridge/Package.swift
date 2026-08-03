// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PoracodeSshBridge",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "PoracodeSshBridge", targets: ["SshBridgePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // 0.11.1 is the newest Citadel release that retains iOS 15 support.
        .package(url: "https://github.com/orlandos-nl/Citadel.git", exact: "0.11.1"),
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.81.0"),
        .package(name: "swift-nio-ssh", url: "https://github.com/Joannis/swift-nio-ssh.git", "0.3.4" ..< "0.4.0"),
        .package(url: "https://github.com/apple/swift-crypto.git", from: "3.12.3")
    ],
    targets: [
        .target(
            name: "SshBridgePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "Citadel", package: "Citadel"),
                .product(name: "NIO", package: "swift-nio"),
                .product(name: "NIOPosix", package: "swift-nio"),
                .product(name: "NIOSSH", package: "swift-nio-ssh"),
                .product(name: "Crypto", package: "swift-crypto")
            ],
            path: "ios/Sources/SshBridgePlugin"
        ),
        .testTarget(
            name: "SshBridgePluginTests",
            dependencies: [
                "SshBridgePlugin",
                .product(name: "Citadel", package: "Citadel")
            ],
            path: "ios/Tests/SshBridgePluginTests"
        )
    ]
)
