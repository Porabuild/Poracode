import Foundation

extension GeneratedRemoteV3Contract {
  static func runtimeToolBodyResponse(_ data: Data) throws -> [RichResolvedToolBodyRecord] {
    try runtimeItemPresentationReadyRows(data, expectedVersion: 5, content: .body).map { row in
      guard let body = RichResolvedToolBody(row.value) else { throw RichChatTransportFailure.invalidResponse }
      return .init(request: row.request, body: body)
    }
  }
}
