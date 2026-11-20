import Foundation

/// UI projection of the generated environment codec's opaque/versioned catalog.
/// This model never writes a transport DTO or changes canonical item data.
struct RichToolPresentationCatalog: Sendable, Equatable {
  let itemTypes: [String: RichToolPresentation]

  init?(_ value: JSONValue?) {
    guard let value, let json = try? RichChatRemoteModelBridge.json(value),
      let object = json.objectValue, object["version"]?.exactInt64Value == 1,
      let entries = object["itemTypes"]?.arrayValue, entries.count <= 16 else { return nil }
    var result: [String: RichToolPresentation] = [:]
    for entry in entries {
      guard let row = entry.objectValue, let type = row["itemType"]?.stringValue,
        !type.isEmpty, type.utf16.count <= 64, result[type] == nil,
        let presentation = RichToolPresentation(row["presentation"]) else { return nil }
      result[type] = presentation
    }
    itemTypes = result
  }
}

struct RichToolPresentation: Sendable, Equatable {
  let sections: [RichToolSection]
  let header: RichToolHeader?
  let mediaSources: [RichToolMediaSource]
  let headerProjection: RichRuntimeItemHeadingProjection?
  let workflowProjection: RichRuntimeItemHeadingProjection?
  let workflowViewProjection: RichRuntimeItemHeadingProjection?
  let bodyProjection: RichRuntimeItemHeadingProjection?
  init?(_ value: RichJSON?) {
    guard let object = value?.objectValue, object["version"]?.exactInt64Value == 1,
      let values = object["sections"]?.arrayValue, values.count <= 8 else { return nil }
    let decoded = values.compactMap(RichToolSection.init)
    guard decoded.count == values.count else { return nil }
    if let raw = object["header"], RichToolHeader(raw) == nil { return nil }
    let rawMedia = object["mediaSources"]?.arrayValue ?? []
    if let raw = object["mediaSources"], raw.arrayValue == nil { return nil }
    let media = rawMedia.compactMap(RichToolMediaSource.init)
    guard rawMedia.count <= 4, media.count == rawMedia.count else { return nil }
    sections = decoded
    header = object["header"].flatMap(RichToolHeader.init)
    mediaSources = media
    headerProjection = object["headerProjection"].flatMap(RichRuntimeItemHeadingProjection.init).flatMap { [1, 2].contains($0.version) ? $0 : nil }
    workflowProjection = object["workflowProjection"].flatMap(RichRuntimeItemHeadingProjection.init).flatMap { $0.version == 3 ? $0 : nil }
    workflowViewProjection = object["workflowViewProjection"].flatMap(RichRuntimeItemHeadingProjection.init).flatMap { $0.version == 4 ? $0 : nil }
    bodyProjection = object["bodyProjection"].flatMap(RichRuntimeItemHeadingProjection.init).flatMap { $0.version == 5 ? $0 : nil }
  }
}

struct RichToolMediaSource: Sendable, Equatable {
  let root: RichToolValueSource.Root
  let path: [RichToolPathKey]
  init?(_ value: RichJSON) {
    guard let object = value.objectValue, let text = object["root"]?.stringValue,
      let root = RichToolValueSource.Root(rawValue: text), let path = RichToolPathKey.path(object["path"]) else { return nil }
    self.root = root; self.path = path
  }
}

struct RichToolHeader: Sendable, Equatable {
  let label: String?
  let source: RichToolTextSource
  let isPath: Bool
  let labelChoice: RichToolLabelChoice?
  let context: RichToolTextSource?
  init?(_ value: RichJSON) {
    guard let object = value.objectValue, let raw = object["source"],
      let source = RichToolTextSource(raw) else { return nil }
    if let label = object["label"], label.stringValue.map(RichToolLabelChoice.labels.contains) != true { return nil }
    if let path = object["path"], path.boolValue == nil { return nil }
    if let raw = object["labelChoice"], RichToolLabelChoice(raw) == nil { return nil }
    self.source = source; label = object["label"]?.stringValue; isPath = object["path"]?.boolValue ?? false
    labelChoice = object["labelChoice"].flatMap(RichToolLabelChoice.init)
    context = object["context"].flatMap(RichToolTextSource.init)
  }
}

struct RichToolLabelChoice: Sendable, Equatable {
  static let labels = Set(["run", "edit", "create", "delete", "search", "view"])
  let source: RichToolTextSource
  let values: [String: String]
  init?(_ value: RichJSON) {
    guard let object = value.objectValue, let raw = object["source"], let source = RichToolTextSource(raw),
      let labels = object["labels"]?.objectValue else { return nil }
    var result: [String: String] = [:]
    for (key, value) in labels {
      guard key.utf16.count <= 64, let label = value.stringValue, Self.labels.contains(label) else { return nil }
      result[key] = label
    }
    self.source = source; values = result
  }
}

struct RichToolSection: Sendable, Equatable {
  enum Kind: String, Sendable { case code, terminal, markdown }
  let kind: Kind
  let label: String?
  let prefix: String
  let source: RichToolTextSource
  let onlyLanguage: String?
  let replaceFollowing: Bool

  init?(_ value: RichJSON) {
    guard let object = value.objectValue, let rawKind = object["kind"]?.stringValue,
      let kind = Kind(rawValue: rawKind), let sourceValue = object["source"],
      let source = RichToolTextSource(sourceValue) else { return nil }
    let labels = Set(["args", "result", "output", "command", "changes", "content", "error"])
    if let label = object["label"], label.stringValue.map(labels.contains) != true { return nil }
    if let prefix = object["prefix"], prefix.stringValue.map({ $0.utf16.count <= 16 }) != true { return nil }
    if let language = object["onlyLanguage"], language.stringValue.map(Set(["plain", "json", "diff"]).contains) != true { return nil }
    if let replacing = object["replaceFollowing"], replacing.boolValue == nil { return nil }
    self.kind = kind; self.source = source
    label = object["label"]?.stringValue
    prefix = object["prefix"]?.stringValue ?? ""
    onlyLanguage = object["onlyLanguage"]?.stringValue
    replaceFollowing = object["replaceFollowing"]?.boolValue ?? false
  }
}

enum RichToolPathKey: Sendable, Equatable {
  case key(String), index(Int)

  static func path(_ value: RichJSON?) -> [Self]? {
    guard let values = value?.arrayValue, values.count <= 12 else { return nil }
    var result: [Self] = []
    for value in values {
      if let key = value.stringValue, key.utf16.count <= 128 { result.append(.key(key)) }
      else if let index = value.exactInt64Value, index >= 0, index <= 1_000_000 { result.append(.index(Int(index))) }
      else { return nil }
    }
    return result
  }
}

struct RichToolValueSource: Sendable, Equatable {
  enum Root: String, Sendable { case payload, streams }
  enum Format: String, Sendable { case value, json, textList = "text-list", terminal }
  enum Accept: String, Sendable { case string, nonString = "non-string", scalar, object }
  let root: Root
  let path: [RichToolPathKey]
  let format: Format
  let accept: Accept?
  let eachPath: [RichToolPathKey]

  init?(_ value: RichJSON) {
    guard let object = value.objectValue,
      let rootText = object["root"]?.stringValue, let root = Root(rawValue: rootText),
      let formatText = object["format"]?.stringValue, let format = Format(rawValue: formatText),
      let path = RichToolPathKey.path(object["path"]) else { return nil }
    if let raw = object["accept"], raw.stringValue.flatMap(Accept.init(rawValue:)) == nil { return nil }
    if let raw = object["eachPath"], RichToolPathKey.path(raw) == nil { return nil }
    self.root = root; self.path = path; self.format = format
    accept = object["accept"]?.stringValue.flatMap(Accept.init(rawValue:))
    eachPath = object["eachPath"].flatMap(RichToolPathKey.path) ?? []
  }
}

enum RichToolTextSource: Sendable, Equatable {
  case value(RichToolValueSource), firstNonempty([RichToolValueSource])
  init?(_ value: RichJSON) {
    // Same union priority as the source schema: a valid value reference wins.
    if let source = RichToolValueSource(value) { self = .value(source); return }
    guard let values = value.objectValue?["firstNonempty"]?.arrayValue,
      !values.isEmpty, values.count <= 8 else { return nil }
    let sources = values.compactMap(RichToolValueSource.init)
    guard sources.count == values.count else { return nil }
    self = .firstNonempty(sources)
  }
}
