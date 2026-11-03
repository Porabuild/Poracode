import Foundation

struct RichMcpAppPresentation: Equatable {
  let reference: RichJSON
  let input: RichJSON
  let result: RichJSON
  let title: String

  init?(item: RichRuntimeItem) {
    guard item.state == .completed, RichItemType.toolLike.contains(item.type),
      let payload = item.payload?.objectValue,
      payload["status"]?.stringValue == "success",
      let result = payload["result"], let object = result.objectValue,
      object["isError"]?.boolValue != true,
      let reference = object["_meta"]?.objectValue?["com.poracode/mcp-app"],
      let app = reference.objectValue,
      app["version"]?.decimalValue == 1,
      let sessionID = app["sessionId"]?.stringValue, UUID(uuidString: sessionID) != nil,
      let tool = app["toolName"]?.stringValue, !tool.isEmpty, tool.count <= 256,
      let uri = app["resourceUri"]?.stringValue, uri.hasPrefix("ui://"), uri.count <= 4096
    else { return nil }
    self.reference = reference
    self.input = payload["args"]?.objectValue.map(RichJSON.object) ?? .object([:])
    self.result = result
    self.title = payload["title"]?.stringValue ?? payload["name"]?.stringValue ?? tool
  }
}
