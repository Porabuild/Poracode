import Foundation

extension GeneratedRemoteV3Contract {
  static func runtimeItemHeadingRequest(threadID: String, requests: [RichRuntimeItemHeadingRequest]) throws -> RichChatPreparedJSONRoute {
    guard let version = requests.first?.version, [1, 2, 3, 4, 5].contains(version), requests.allSatisfy({ $0.version == version }) else {
      throw RichChatTransportFailure.invalidResponse
    }
    let path = try canonicalData(try richData(.object(["threadId": .string(threadID)])),
      codec: RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EPath, boundary: "item presentations path")
    let input: RichJSON = .object(["version": .number(Decimal(version)), "items": .array(requests.map {
      .object(["itemId": .string($0.itemID), "inputDigest": .string($0.inputDigest)])
    })])
    let body = try canonicalData(try richData(input),
      codec: RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2ERequest, boundary: "item presentations request")
    return .init(pathValues: try richPathValues(path, keys: ["threadId"]), body: body)
  }

  static func runtimeItemHeadingQuery() throws -> [URLQueryItem] {
    let data = try canonicalData(try richData(.object([
      "notices": .string("v1"), "maxBytes": .number(Decimal(runtimeItemPresentationMaxBytes)), "maxDecodeBytes": .number(Decimal(runtimeItemPresentationMaxBytes * 2)),
    ])), codec: RemoteRootCodecs.routeU2EThreadU2DItemU2DPresentationsU2EQuery, boundary: "item presentations query")
    return try richQueryItems(data, order: ["notices", "maxBytes", "maxDecodeBytes"])
  }

  static func runtimeItemHeadingResponse(_ data: Data, expectedVersion: Int = 1) throws -> [RichRuntimeItemHeadingRecord] {
    try runtimeItemPresentationReadyRows(data, expectedVersion: expectedVersion, content: .header).map { row in
      guard let heading = RichRuntimeItemHeading(row.value) else { throw RichChatTransportFailure.invalidResponse }
      return .init(request: row.request, heading: heading)
    }
  }
}
