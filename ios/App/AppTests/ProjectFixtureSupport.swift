import Foundation

@testable import App

enum ProjectFixtureLoader {
    static func decode<Value: Decodable>(_ type: Value.Type, named name: String) throws -> Value {
        try JSONDecoder().decode(type, from: data(named: name))
    }

    static func decode<Value: Decodable>(_ type: Value.Type, json: JSONValue) throws -> Value {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(json))
    }

    static func data(named name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("protocol/remote/v3/fixtures/\(name)")
        return try Data(contentsOf: url)
    }
}
