import Foundation

extension Foundation.Bundle {
    static nonisolated let module: Bundle = {
        let mainPath = Bundle.main.bundleURL.appendingPathComponent("AdvancedOperationsIsolation_AdvancedOperations.bundle").path
        let buildPath = "/Users/svecherenko/work/lightcode/ios/App/AppTests/AdvancedOperations/.build/arm64-apple-macosx/debug/AdvancedOperationsIsolation_AdvancedOperations.bundle"

        let preferredBundle = Bundle(path: mainPath)

        guard let bundle = preferredBundle ?? Bundle(path: buildPath) else {
            // Users can write a function called fatalError themselves, we should be resilient against that.
            Swift.fatalError("could not load resource bundle: from \(mainPath) or \(buildPath)")
        }

        return bundle
    }()
}