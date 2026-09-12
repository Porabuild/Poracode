import CryptoKit
import Foundation

enum PushStorageError: Error, Sendable, Equatable {
  case unavailable
  case incompatible
}

enum PushDocumentLoad<Value: Sendable>: Sendable {
  case missing
  case current(Value)
  case preservedInvalid(Data)

  var isUsable: Bool {
    switch self {
    case .missing, .current: true
    case .preservedInvalid: false
    }
  }
}

enum PushFingerprint {
  static func of(_ value: String?) -> String? {
    guard let value else { return nil }
    return SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
  }
}

extension Data {
  var lowercaseHexString: String {
    map { String(format: "%02x", $0) }.joined()
  }
}
