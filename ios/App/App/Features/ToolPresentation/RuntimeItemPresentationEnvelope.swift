import Foundation

enum RichRuntimeItemPresentationContent: String { case header, body }
struct RichRuntimeItemPresentationReadyRow {
  let request: RichRuntimeItemHeadingRequest
  let value: RichJSON
}

extension GeneratedRemoteV3Contract {
  static var runtimeItemPresentationMaxBytes: Int { 1_048_576 }

  /// One byte/version/generated-codec/identity boundary for every advisory read.
  static func runtimeItemPresentationReadyRows(_ data: Data, expectedVersion: Int,
    content: RichRuntimeItemPresentationContent) throws -> [RichRuntimeItemPresentationReadyRow] {
    guard data.count <= runtimeItemPresentationMaxBytes else { throw RichChatTransportFailure.invalidResponse }
    let canonical = try canonicalData(data, codec: RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EResponse,
      boundary: "item presentations response")
    let value = try RichJSON.decode(canonical)
    guard value.objectValue?["version"]?.exactInt64Value == Int64(expectedVersion),
      let items = value.objectValue?["items"]?.arrayValue else { throw RichChatTransportFailure.invalidResponse }
    var seen: Set<String> = [], rows: [RichRuntimeItemPresentationReadyRow] = []
    for item in items {
      guard let object = item.objectValue, let id = object["itemId"]?.stringValue,
        seen.insert(id).inserted else { throw RichChatTransportFailure.invalidResponse }
      guard object["status"]?.stringValue == "ready" else { continue }
      guard let digest = object["inputDigest"]?.stringValue, let value = object[content.rawValue] else {
        throw RichChatTransportFailure.invalidResponse
      }
      rows.append(.init(request: .init(itemID: id, inputDigest: digest, version: expectedVersion), value: value))
    }
    return rows
  }
}
