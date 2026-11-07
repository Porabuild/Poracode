import Foundation

/// A file reference the chat can present as a downloadable card: a typed
/// `kind:"file"` payload or a standalone markdown link to a local artifact.
struct RichChatFileRef: Sendable, Equatable {
  let path: String
  let fileName: String
  /// Typed `kind:"file"` payloads bypass the artifact-extension gate.
  let isTypedFile: Bool
}

/// Parsed media-ticket access, mirroring the renderer's `chatFileMediaRequest`.
enum RichChatFileAccess: Sendable, Equatable {
  case project(relativePath: String)
  case external(path: String)
}

enum RichChatFilePolicyError: Error, Equatable {
  case traversal
  case rootIsNotFile
  case emptyPath
  case unsupportedLocation
  case malformedEncoding
}

enum RichChatFilePolicy {
  static let artifactExtensions: Set<String> = [
    "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar",
    "pdf", "doc", "docx", "odt", "rtf", "ppt", "pptx", "odp",
    "xls", "xlsx", "ods", "csv", "tsv", "epub", "txt",
    "apk", "aab", "ipa", "dmg", "pkg", "exe", "msi", "deb", "rpm",
  ]

  private static let schemeRegex = try! NSRegularExpression(
    pattern: #"^[a-zA-Z][a-zA-Z0-9+.-]*:"#)
  private static let driveRegex = try! NSRegularExpression(pattern: #"^[a-zA-Z]:[\\/]"#)

  /// Bare filesystem paths, `file://` and canonical `poracode-local://local/`
  /// only. Web URLs keep normal external-link behavior; opaque schemes inert.
  static func isSafeFileSource(_ src: String) -> Bool {
    guard !src.isEmpty else { return false }
    for scalar in src.unicodeScalars where scalar.value < 0x20 || scalar.value == 0x7F {
      return false
    }
    let full = NSRange(src.startIndex..., in: src)
    if schemeRegex.firstMatch(in: src, range: full) != nil,
      driveRegex.firstMatch(in: src, range: full) == nil
    {
      let head = src.lowercased()
      if head.hasPrefix("file://") { return true }
      let canonical = "poracode-local://local"
      guard head.hasPrefix(canonical) else { return false }
      return src.count == canonical.count || "/?#".contains(src[src.index(src.startIndex, offsetBy: canonical.count)])
    }
    return true
  }

  /// Decoded local filesystem path for a safe file source, exactly once.
  /// `file://` authority becomes the UNC host; canonical `poracode-local://`
  /// strips the `local` authority. Bare paths keep literal `%`/`#`/`?`.
  static func localPath(from src: String) -> String? {
    guard isSafeFileSource(src) else { return nil }
    let lower = src.lowercased()
    if lower.hasPrefix("poracode-local://local") {
      // A path must follow the canonical authority — bare `?`/`#` suffixes
      // carry none and reject rather than decode to an empty string.
      guard src.count > "poracode-local://local".count,
        src[src.index(src.startIndex, offsetBy: "poracode-local://local".count)] == "/"
      else { return nil }
      var rest = src.dropFirst("poracode-local://local".count)
      rest = rest.split(separator: "#", maxSplits: 1).first ?? ""
      rest = rest.split(separator: "?", maxSplits: 1).first ?? ""
      guard let decoded = percentDecodeOnce(String(rest)), isDecodedPath(decoded)
      else { return nil }
      // Canonical `/C:/x` strips to `C:/x` like the `file:///` branch.
      if decoded.hasPrefix("/") {
        let tail = decoded.dropFirst()
        if tail.count > 2, tail[tail.index(tail.startIndex, offsetBy: 1)] == ":" {
          return String(tail)
        }
      }
      return decoded
    }
    if lower.hasPrefix("file://") {
      var rest = src.dropFirst("file://".count)
      rest = rest.split(separator: "#", maxSplits: 1).first ?? ""
      rest = rest.split(separator: "?", maxSplits: 1).first ?? ""
      guard let decoded = percentDecodeOnce(String(rest)), isDecodedPath(decoded)
      else { return nil }
      // `file://host/share` -> UNC `//host/share`; `file:///C:/x` -> `C:/x`;
      // `file://localhost/...` is the local root, never a UNC host.
      if decoded.hasPrefix("//") { return decoded }
      if !decoded.hasPrefix("/") {
        if decoded.lowercased().hasPrefix("localhost/") {
          // Local root: keep the leading-slash suffix after the authority,
          // with the same drive stripping as `file:///C:`.
          let suffix = decoded.dropFirst("localhost".count)
          if suffix.count > 3,
            suffix[suffix.index(suffix.startIndex, offsetBy: 2)] == ":"
          {
            return String(suffix.dropFirst())
          }
          return String(suffix)
        }
        return "//" + decoded
      }
      let tail = decoded.dropFirst()
      if tail.count > 2, tail[tail.index(tail.startIndex, offsetBy: 1)] == ":" {
        return String(tail)
      }
      return decoded
    }
    return src
  }

  /// Strict UTF-8 percent decoding — literal Unicode in the destination is
  /// UTF-8 encoded alongside percent triplets; malformed escapes or UTF-8
  /// sequences reject the whole destination.
  static func percentDecodeOnce(_ value: String) -> String? {
    guard value.contains("%") else { return value }
    var bytes: [UInt8] = []
    bytes.reserveCapacity(value.utf8.count)
    var index = value.startIndex
    while index < value.endIndex {
      let ch = value[index]
      if ch == "%" {
        let hexStart = value.index(after: index)
        guard hexStart < value.endIndex else { return nil }
        let hexEnd = value.index(hexStart, offsetBy: 2, limitedBy: value.endIndex)
        guard let hexEnd, hexEnd <= value.endIndex,
          let byte = UInt8(value[hexStart..<hexEnd], radix: 16)
        else { return nil }
        bytes.append(byte)
        index = hexEnd
      } else {
        bytes.append(contentsOf: String(ch).utf8)
        index = value.index(after: index)
      }
    }
    return String(bytes: bytes, encoding: .utf8)
  }

  /// Reject control characters, empty results and traversal after decoding.
  private static func isDecodedPath(_ path: String) -> Bool {
    guard !path.isEmpty else { return false }
    for scalar in path.unicodeScalars where scalar.value < 0x20 || scalar.value == 0x7F {
      return false
    }
    return !containsTraversal(path)
  }

  /// Artifact-extension classification for a plain-markdown path; a bare
  /// dotfile like `.zip` has no extension and stays inert.
  static func isArtifactPath(_ path: String, mimeType: String? = nil) -> Bool {
    if mimeType == "application/octet-stream" || mimeType == "application/pdf" {
      return true
    }
    let name = basename(path)
    guard let dot = name.lastIndex(of: "."), dot > name.startIndex else { return false }
    return artifactExtensions.contains(String(name[name.index(after: dot)...]).lowercased())
  }

  static func isDownloadSource(_ src: String, mimeType: String? = nil) -> Bool {
    guard let path = localPath(from: src) else { return false }
    return isArtifactPath(path, mimeType: mimeType)
  }

  /// Typed `kind:"file"` blocks: any safe, traversal-free local path.
  static func typedFileRef(path: String, name: String?) -> RichChatFileRef? {
    guard let local = localPath(from: path), !containsTraversal(local) else { return nil }
    let explicit = name?.trimmingCharacters(in: .whitespacesAndNewlines)
    return RichChatFileRef(
      path: local,
      fileName: explicit?.isEmpty == false ? explicit! : basename(local),
      isTypedFile: true
    )
  }

  /// Markdown destinations are URLs: a scheme source decodes through
  /// `localPath` once; a bare destination decodes once here (literal `%` in a
  /// typed raw path is preserved because `localPath` returns bare paths
  /// untouched).
  static func markdownFileRef(src: String, name: String? = nil) -> RichChatFileRef? {
    let destination = decodedMarkdownDestination(src)
    guard let destination else { return nil }
    guard isArtifactPath(destination), !containsTraversal(destination) else { return nil }
    let explicit = name?.trimmingCharacters(in: .whitespacesAndNewlines)
    return RichChatFileRef(
      path: destination,
      fileName: explicit?.isEmpty == false ? explicit! : basename(destination),
      isTypedFile: false
    )
  }

  static func isMarkdownDownloadSource(_ src: String) -> Bool {
    markdownFileRef(src: src) != nil
  }

  /// Single-decoding markdown destination: URL sources through `localPath`;
  /// bare destinations through `percentDecodeOnce` then the source gate.
  static func decodedMarkdownDestination(_ src: String) -> String? {
    let full = NSRange(src.startIndex..., in: src)
    if schemeRegex.firstMatch(in: src, range: full) != nil,
      driveRegex.firstMatch(in: src, range: full) == nil
    {
      return localPath(from: src)
    }
    guard let decoded = percentDecodeOnce(src), isSafeFileSource(decoded) else { return nil }
    return decoded
  }

  static func basename(_ path: String) -> String {
    let trimmed = path.reversed().drop(while: { $0 == "/" || $0 == "\\" })
    guard let last = trimmed.split(whereSeparator: { $0 == "/" || $0 == "\\" }).first
    else { return path }
    return String(last.reversed())
  }

  /// Parses text that is entirely one `[label](dest)` or `[label](<dest>)`
  /// markdown link. Returns the label and the RAW (still-escaped) destination;
  /// decoding happens once in `markdownFileRef`/`decodedMarkdownDestination`.
  static func markdownLink(in text: String) -> (label: String, destination: String)? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard trimmed.hasPrefix("["),
      let close = trimmed.firstIndex(of: "]"),
      trimmed.index(after: close) < trimmed.endIndex,
      trimmed[trimmed.index(after: close)] == "("
    else { return nil }
    let label = String(trimmed[trimmed.index(after: trimmed.startIndex)..<close])
    var rest = trimmed[trimmed.index(after: close)...].dropFirst()
    let destination: String
    if rest.first == "<" {
      guard let end = rest.firstIndex(of: ">") else { return nil }
      destination = String(rest[rest.index(after: rest.startIndex)..<end])
      rest = rest[rest.index(after: end)...]
      // The closing paren of `(<dest>)` must be consumed exactly.
      guard rest.first == ")" else { return nil }
      rest = rest.dropFirst()
    } else {
      var collected = ""
      var i = rest.startIndex
      var closed = false
      var depth = 0
      while i < rest.endIndex {
        let ch = rest[i]
        if ch == "\\",
          let next = rest.index(i, offsetBy: 1, limitedBy: rest.endIndex),
          next < rest.endIndex, "()\\".contains(rest[next])
        {
          // Markdown escapes collapse once at parse; backslashes before other
          // characters (Windows separators) survive.
          collected.append(rest[next])
          i = rest.index(after: next)
          continue
        }
        if ch == "(" { depth += 1 }
        if ch == ")" {
          if depth == 0 { closed = true; i = rest.index(after: i); break }
          depth -= 1
        }
        collected.append(ch)
        i = rest.index(after: i)
      }
      guard closed else { return nil }
      destination = collected
      rest = rest[i...]
    }
    guard rest.trimmingCharacters(in: .whitespaces).isEmpty, !destination.isEmpty
    else { return nil }
    return (label, destination)
  }

  private static func containsTraversal(_ path: String) -> Bool {
    path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).contains("..")
  }

  /// Records a leading `/` or `//` prefix before stripping empty/`.` segments;
  /// `..` is never collapsed. `C:\x` and `C:/x` both normalize to `C:/x`.
  private static func normalizeSeparators(_ path: String) -> String {
    var prefix = ""
    var rest = path
    if rest.hasPrefix("\\\\") || rest.hasPrefix("//") {
      prefix = "//"
      rest = String(rest.dropFirst(2))
    } else if rest.hasPrefix("/") || rest.hasPrefix("\\") {
      prefix = "/"
      rest = String(rest.dropFirst())
    }
    let parts = rest.split(whereSeparator: { $0 == "/" || $0 == "\\" })
      .map(String.init)
      .filter { !$0.isEmpty && $0 != "." }
    return prefix + parts.joined(separator: "/")
  }

  private static func isAbsoluteFsPath(_ path: String) -> Bool {
    path.hasPrefix("/") || path.hasPrefix("\\")
      || driveRegex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)) != nil
  }

  /// Mirror of the renderer's `chatFileMediaRequest`: contained absolutes →
  /// project-relative, outside absolutes → explicit external, relatives →
  /// project. `..` throws in every form. `remoteServerId` rejects — never a
  /// cross-host read.
  static func resolve(_ path: String, location: ProjectLocation) throws -> RichChatFileAccess {
    if location.remoteServerId != nil {
      throw RichChatFilePolicyError.unsupportedLocation
    }
    guard !path.isEmpty else { throw RichChatFilePolicyError.emptyPath }
    if containsTraversal(path) { throw RichChatFilePolicyError.traversal }
    let normalized = normalizeSeparators(path)
    if containsTraversal(normalized) { throw RichChatFilePolicyError.traversal }
    guard !normalized.isEmpty, normalized != "/", normalized != "//" else {
      throw RichChatFilePolicyError.rootIsNotFile
    }
    if !isAbsoluteFsPath(normalized) {
      return .project(relativePath: normalized)
    }
    // Root candidates: Windows path, POSIX path, WSL linux AND unc forms.
    var roots: [String] = []
    switch location {
    case .posix(let root, _): roots.append(normalizeSeparators(root))
    case .windows(let root, _): roots.append(normalizeSeparators(root))
    case .wsl(_, let linuxPath, let uncPath, _):
      roots.append(normalizeSeparators(linuxPath))
      roots.append(normalizeSeparators(uncPath))
    }
    let insensitive = location.kind == .windows
    let haystack = insensitive ? normalized.lowercased() : normalized
    for rawRoot in roots {
      // A "/" root is kept — it contains every POSIX descendant.
      let root = rawRoot == "/" ? "/" : rawRoot.replacingOccurrences(
        of: "/+$", with: "", options: .regularExpression)
      guard !root.isEmpty else { continue }
      let needle = insensitive ? root.lowercased() : root
      if normalized.hasPrefix("//") && !needle.hasPrefix("//") { continue }
      if needle == "/" {
        // A "/" root contains POSIX descendants but never UNC shares.
        guard haystack.hasPrefix("/"), !haystack.hasPrefix("//") else { continue }
        return .project(relativePath: String(normalized.dropFirst()))
      }
      if haystack == needle { throw RichChatFilePolicyError.rootIsNotFile }
      if haystack.hasPrefix(needle + "/") {
        return .project(relativePath: String(normalized.dropFirst(needle.count + 1)))
      }
    }
    return .external(path: normalized)
  }

  /// Safe download filename: basename only; separators, controls and bare
  /// `.`/`..`/empty never reach the filesystem.
  static func sanitizedFileName(_ name: String) -> String {
    let base = basename(name)
    let cleaned = String(base.unicodeScalars.filter {
      $0.value >= 0x20 && $0.value != 0x7F && $0 != "/" && $0 != "\\" && $0 != ":"
    }).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty, cleaned != ".", cleaned != ".." else { return "download" }
    return cleaned
  }

  /// `attachment` disposition + `application/octet-stream` semantics.
  static func isAttachmentResponse(contentDisposition: String?, contentType: String?) -> Bool {
    guard let disposition = contentDisposition?.lowercased(),
      disposition == "attachment" || disposition.hasPrefix("attachment;")
    else { return false }
    let type = contentType?.split(separator: ";").first?
      .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return type == "application/octet-stream"
  }
}
