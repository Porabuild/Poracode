import Foundation

/// Translates transcript source references into workspace-relative file jumps.
/// The sender's absolute filesystem path never becomes a device file URL.
enum RichChatProjectFileLink {
  private static let scheme = "poracode-transcript-file"
  private static let pathPrefix = "https://poracode.local/path/"
  private static let legacyPathPrefix = "poracode:path:"
  private static let extensions: Set<String> = [
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "mdx", "txt",
    "css", "scss", "rs", "go", "py", "toml", "yaml", "yml", "vue", "svelte",
    "html", "htm", "swift", "kt", "kts", "java", "rb", "sh", "c", "h", "cpp",
  ]
  private static let lineSuffix = try! NSRegularExpression(
    pattern: #"(?::([0-9]+)(?:-[0-9]+)?|#L([0-9]+)(?:-L?[0-9]+)?)$"#
  )
  private static let pathVersion = try! NSRegularExpression(pattern: #"^v[0-9]+[/?]"#)

  static func target(
    _ source: String, in location: ProjectLocation, markdown: Bool
  ) -> ProjectWorkspaceFileTarget? {
    let source = source.trimmingCharacters(in: .whitespaces)
    if source.hasPrefix(pathPrefix + "v2/") {
      guard let components = URLComponents(string: source), components.fragment == nil,
        let path = RichChatFilePolicy.percentDecodeOnce(
          String(components.percentEncodedPath.dropFirst("/path/v2/".count))
        ),
        let line = lineNumber(components.queryItems, allowing: ["line", "endLine"])
      else { return nil }
      return projectTarget(path, line: line, in: location)
    }
    for prefix in [pathPrefix, legacyPathPrefix] where source.hasPrefix(prefix) {
      let relative = String(source.dropFirst(prefix.count))
      guard pathVersion.firstMatch(in: relative, range: NSRange(relative.startIndex..., in: relative)) == nil,
        let decoded = RichChatFilePolicy.percentDecodeOnce(relative)
      else { return nil }
      let (path, line) = splitLine(decoded)
      return projectTarget(path, line: line, in: location)
    }
    if !markdown && source.contains(where: \.isWhitespace) { return nil }
    let (reference, line) = splitLine(source)
    let path = markdown
      ? RichChatFilePolicy.decodedMarkdownDestination(reference)
      : RichChatFilePolicy.localPath(from: reference)
    guard let path, !path.hasPrefix("@"),
      !path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).contains(where: {
        $0 == "..." || $0.contains("…")
      })
    else { return nil }
    let name = RichChatFilePolicy.basename(path)
    let ext = name.split(separator: ".").last?.lowercased() ?? ""
    guard line != nil || (name.contains(".") && extensions.contains(ext))
      || name == "Makefile" || name == "Dockerfile"
    else { return nil }
    return projectTarget(path, line: line, in: location)
  }

  static func url(for target: ProjectWorkspaceFileTarget) -> URL? {
    var components = URLComponents()
    components.scheme = scheme
    components.host = "project"
    components.queryItems = [URLQueryItem(name: "path", value: target.path)]
    if let line = target.line {
      components.queryItems?.append(URLQueryItem(name: "line", value: String(line)))
    }
    return components.url
  }

  static func target(from url: URL, in location: ProjectLocation) -> ProjectWorkspaceFileTarget? {
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme == scheme, components.host == "project",
      components.path.isEmpty, components.fragment == nil,
      let items = components.queryItems,
      let path = items.first(where: { $0.name == "path" })?.value,
      let line = lineNumber(items, allowing: ["path", "line"])
    else { return nil }
    return projectTarget(path, line: line, in: location)
  }

  static func isExternal(_ url: URL) -> Bool {
    guard ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") else { return false }
    return url.host?.lowercased() != "poracode.local"
      || !(url.path.hasPrefix("/path/") || url.path.hasPrefix("/folder/"))
  }

  static func isProjectReference(_ url: URL) -> Bool { url.scheme == scheme }

  /// Attachment paths are already decoded by the transcript file policy.
  static func attachmentTarget(_ path: String, in location: ProjectLocation) -> ProjectWorkspaceFileTarget? {
    guard RichChatFilePolicy.isEditableTextAttachment(path),
      var target = projectTarget(path, line: nil, in: location)
    else { return nil }
    target.resolvesBareName = RichChatFilePolicy.usesWorkspaceBasenameLookup(path)
    return target
  }

  private static func splitLine(_ reference: String) -> (String, Int?) {
    guard let match = lineSuffix.firstMatch(
      in: reference, range: NSRange(reference.startIndex..., in: reference)
    ), let suffix = Range(match.range, in: reference) else { return (reference, nil) }
    let line = [1, 2].compactMap { index in
      Range(match.range(at: index), in: reference).flatMap { Int(reference[$0]) }
    }.first
    return (String(reference[..<suffix.lowerBound]), line.flatMap { $0 > 0 ? $0 : nil })
  }

  /// An absent line is valid. A duplicate or malformed value invalidates the URL.
  private static func lineNumber(_ items: [URLQueryItem]?, allowing keys: Set<String>) -> Int?? {
    var seen = Set<String>()
    var line: Int?
    for item in items ?? [] {
      guard keys.contains(item.name), seen.insert(item.name).inserted, let value = item.value
      else { return nil }
      if item.name == "path" { continue }
      guard value.utf8.allSatisfy({ (48...57).contains($0) }),
        let number = Int(value), number > 0 else { return nil }
      if item.name == "line" { line = number }
    }
    return seen.contains("endLine") && line == nil ? nil : .some(line)
  }

  private static func projectTarget(_ path: String, line: Int?, in location: ProjectLocation)
    -> ProjectWorkspaceFileTarget?
  {
    guard RichChatFilePolicy.isSafeFileSource(path),
      !path.hasSuffix("/"), !path.hasSuffix("\\"),
      case .project(let relativePath) = try? RichChatFilePolicy.resolve(path, location: location)
    else { return nil }
    return ProjectWorkspaceFileTarget(path: relativePath, line: line)
  }
}
