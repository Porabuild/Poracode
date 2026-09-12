import Foundation

/// Stable client-side host identity. Never equal to `desktopId`.
///
/// Two pairings of the same desktop are distinct hosts when their
/// `ClientConnectionID` values differ. Encoded as a lowercase UUID string.
struct ClientConnectionID: Hashable, Codable, Sendable, Equatable, Identifiable, RawRepresentable {
    let uuid: UUID

    var id: UUID { uuid }
    var rawValue: String { uuid.uuidString.lowercased() }

    init(_ uuid: UUID = UUID()) {
        self.uuid = uuid
    }

    init?(rawValue: String) {
        guard rawValue == rawValue.lowercased(),
              let uuid = UUID(uuidString: rawValue),
              uuid.uuidString.lowercased() == rawValue
        else { return nil }
        self.uuid = uuid
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard raw == raw.lowercased(),
              let uuid = UUID(uuidString: raw),
              uuid.uuidString.lowercased() == raw
        else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ClientConnectionID"
            )
        }
        self.uuid = uuid
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

/// Collision-free identity for a host-owned remote object.
///
/// Remote ids are URL-safe Base64 encoded so delimiters in provider ids cannot
/// collide with the client connection id. Decode before making transport calls.
struct CompositeRemoteID: Hashable, Sendable, Equatable, RawRepresentable, Identifiable {
    struct Parts: Sendable, Equatable {
        var connectionId: ClientConnectionID
        var remoteId: String
    }

    let rawValue: String
    var id: String { rawValue }

    init(rawValue: String) {
        self.rawValue = rawValue
    }

    init(connectionId: ClientConnectionID, remoteId: String) {
        let encoded = Data(remoteId.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        rawValue = "\(connectionId.rawValue):\(encoded)"
    }

    func decode() -> Parts? {
        guard let separator = rawValue.firstIndex(of: ":") else { return nil }
        let connectionRaw = String(rawValue[..<separator])
        let encodedStart = rawValue.index(after: separator)
        let encoded = String(rawValue[encodedStart...])
        guard let connectionId = ClientConnectionID(rawValue: connectionRaw) else { return nil }
        let standard = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = String(repeating: "=", count: (4 - standard.count % 4) % 4)
        guard let data = Data(base64Encoded: standard + padding),
              let remoteId = String(data: data, encoding: .utf8)
        else { return nil }
        return Parts(connectionId: connectionId, remoteId: remoteId)
    }
}

extension ClientConnectionID: Comparable {
    static func < (lhs: ClientConnectionID, rhs: ClientConnectionID) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

extension ClientConnectionID: CustomStringConvertible, CustomDebugStringConvertible {
    var description: String { rawValue }
    var debugDescription: String { "ClientConnectionID(\(rawValue))" }
}
