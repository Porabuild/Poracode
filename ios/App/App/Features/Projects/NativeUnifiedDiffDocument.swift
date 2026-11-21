import Foundation

enum NativeUnifiedDiffLineKind: Equatable {
  case metadata
  case hunk
  case addition
  case deletion
  case context
}

struct NativeUnifiedDiffLine: Identifiable, Equatable {
  let id: Int
  let text: String
  let kind: NativeUnifiedDiffLineKind
  let oldLineNumber: Int64?
  let newLineNumber: Int64?

  var isStructuralFileHeader: Bool {
    kind == .metadata && ["diff --git ", "index ", "--- ", "+++ "].contains(where: text.hasPrefix)
  }

  var annotationTarget: (lineNumber: Int64, side: RichDiffSide)? {
    switch kind {
    case .addition, .context: newLineNumber.map { ($0, .new) }
    case .deletion: oldLineNumber.map { ($0, .old) }
    case .metadata, .hunk: nil
    }
  }

  static func parse(_ diff: String) -> [Self] {
    NativeUnifiedDiffFile.parse(diff).flatMap(\.lines)
  }
}

struct NativeUnifiedDiffFile: Identifiable, Equatable {
  let id: Int
  let path: String?
  let lines: [NativeUnifiedDiffLine]

  static func parse(_ diff: String) -> [Self] {
    let source = diff.split(omittingEmptySubsequences: false) { $0 == "\n" || $0 == "\r\n" }
    var files: [Self] = []
    var file = FileBuilder()

    for (index, text) in source.enumerated() {
      let gitHeader = text.hasPrefix("diff --git ")
      // A paired header marks the next file in a patch without Git headers.
      // Within a hunk the same prefixes can be ordinary added/removed code.
      let plainHeader = file.hasHunk && file.hunk?.hasRemaining != true
        && text.hasPrefix("--- ") && index + 1 < source.count && source[index + 1].hasPrefix("+++ ")
      if (gitHeader && file.hasFileStart) || plainHeader {
        files.append(file.build(id: files.count))
        file = FileBuilder()
      }
      file.append(text, index: index, gitHeader: gitHeader)
    }

    if !file.lines.isEmpty { files.append(file.build(id: files.count)) }
    return files
  }

  private struct FileBuilder {
    var lines: [NativeUnifiedDiffLine] = []
    var hunk: Hunk?
    var hasHunk = false
    var hasFileStart = false
    var oldPath: String?
    var newPath: String?
    var renamedPath: String?
    var headerPath: String?

    mutating func append(_ raw: Substring, index: Int, gitHeader: Bool) {
      let kind: NativeUnifiedDiffLineKind
      var oldLine: Int64?
      var newLine: Int64?
      if gitHeader {
        hasFileStart = true
        headerPath = NativeDiffPath.gitHeader(raw.dropFirst("diff --git ".count))
        kind = .metadata
      } else if raw.hasPrefix("@@") {
        hasFileStart = true
        hasHunk = true
        hunk = Hunk(raw)
        kind = .hunk
      } else if raw.hasPrefix("\\ No newline") {
        kind = .metadata
      } else if !hasHunk && recordFileMetadata(raw) {
        kind = .metadata
      } else {
        switch raw.first {
        case "+": kind = .addition
        case "-": kind = .deletion
        default: kind = .context
        }
        if kind == .deletion || raw.first == " " { oldLine = hunk?.takeOldLine() }
        if kind == .addition || raw.first == " " { newLine = hunk?.takeNewLine() }
      }
      lines.append(NativeUnifiedDiffLine(
        id: index, text: String(raw), kind: kind, oldLineNumber: oldLine, newLineNumber: newLine
      ))
    }

    private mutating func recordFileMetadata(_ text: Substring) -> Bool {
      if text.hasPrefix("--- ") {
        hasFileStart = true
        oldPath = NativeDiffPath.fileHeader(text.dropFirst(4), prefix: "a/")
      } else if text.hasPrefix("+++ ") {
        hasFileStart = true
        newPath = NativeDiffPath.fileHeader(text.dropFirst(4), prefix: "b/")
      } else if text.hasPrefix("rename to ") || text.hasPrefix("copy to ") {
        renamedPath = NativeDiffPath.unquote(text.dropFirst(text.hasPrefix("rename") ? 10 : 8))
      } else {
        return ["diff ", "index ", "Binary files ", "GIT binary patch", "new file mode ",
                "deleted file mode ", "old mode ", "new mode ", "similarity index ",
                "dissimilarity index ", "rename from ", "copy from "].contains(where: text.hasPrefix)
      }
      return true
    }

    func build(id: Int) -> NativeUnifiedDiffFile {
      let path = [newPath, renamedPath, oldPath, headerPath].compactMap { $0 }
        .first { !$0.isEmpty && $0 != "/dev/null" }
      return NativeUnifiedDiffFile(id: id, path: path, lines: lines)
    }
  }

  private struct Hunk {
    var old: RangeCursor
    var new: RangeCursor

    var hasRemaining: Bool { old.remaining > 0 || new.remaining > 0 }

    init?(_ line: Substring) {
      let fields = line.split(separator: " ", maxSplits: 4)
      guard fields.count >= 4, fields[0] == "@@", fields[3] == "@@",
        let old = RangeCursor(fields[1], prefix: "-"),
        let new = RangeCursor(fields[2], prefix: "+") else { return nil }
      self.old = old
      self.new = new
    }

    mutating func takeOldLine() -> Int64? { old.takeLine() }
    mutating func takeNewLine() -> Int64? { new.takeLine() }
  }

  private struct RangeCursor {
    var next: Int64?
    var remaining: Int64

    init?(_ range: Substring, prefix: Character) {
      guard range.first == prefix else { return nil }
      let fields = range.dropFirst().split(separator: ",", omittingEmptySubsequences: false)
      guard fields.count == 1 || fields.count == 2, let start = Int64(fields[0]), start >= 0,
        let count = fields.count == 2 ? Int64(fields[1]) : 1, count >= 0 else { return nil }
      next = start
      remaining = count
    }

    mutating func takeLine() -> Int64? {
      let number = next
      if let number { next = number == .max ? nil : number + 1 }
      if remaining > 0 { remaining -= 1 }
      return number
    }
  }
}

private enum NativeDiffPath {
  static func fileHeader(_ field: Substring, prefix: String) -> String? {
    let raw = field.prefix { $0 != "\t" }
    return normalized(unquote(raw), prefix: prefix)
  }

  static func gitHeader(_ fields: Substring) -> String? {
    if fields.first == "\"", let end = fields.dropFirst().firstUnescapedQuote {
      return normalized(unquote(fields[fields.index(after: end)...].drop(while: { $0 == " " })), prefix: "b/")
    }
    // Unquoted binary and mode-only paths may contain spaces. The two sides
    // name the same file in that case. Prefer the separator that proves this.
    var cursor = fields.startIndex
    while let separator = fields.range(of: " b/", range: cursor..<fields.endIndex) {
      let old = normalized(String(fields[..<separator.lowerBound]), prefix: "a/")
      let new = String(fields[separator.upperBound...])
      if old == new { return new }
      cursor = separator.upperBound
    }
    if let separator = fields.range(of: " \"b/") {
      return normalized(unquote(fields[fields.index(after: separator.lowerBound)...]), prefix: "b/")
    }
    return nil
  }

  private static func normalized(_ path: String, prefix: String) -> String? {
    if path.isEmpty { return nil }
    return path.hasPrefix(prefix) ? String(path.dropFirst(prefix.count)) : path
  }

  static func unquote(_ field: Substring) -> String {
    guard field.first == "\"", field.last == "\"", field.count > 1 else { return String(field) }
    let bytes = Array(field.dropFirst().dropLast().utf8)
    var decoded: [UInt8] = []
    var index = 0
    while index < bytes.count {
      let byte = bytes[index]
      index += 1
      guard byte == 92, index < bytes.count else {
        decoded.append(byte)
        continue
      }
      if (48...55).contains(bytes[index]) {
        var octal = 0
        for _ in 0..<3 {
          guard index < bytes.count, (48...55).contains(bytes[index]) else { break }
          octal = octal * 8 + Int(bytes[index] - 48)
          index += 1
        }
        decoded.append(UInt8(truncatingIfNeeded: octal))
      } else {
        switch bytes[index] {
        case 110: decoded.append(10)
        case 114: decoded.append(13)
        case 116: decoded.append(9)
        case 97: decoded.append(7)
        case 98: decoded.append(8)
        case 102: decoded.append(12)
        case 118: decoded.append(11)
        default: decoded.append(bytes[index])
        }
        index += 1
      }
    }
    return String(decoding: decoded, as: UTF8.self)
  }
}

private extension Substring {
  var firstUnescapedQuote: String.Index? {
    var escaped = false
    for index in indices {
      let character = self[index]
      if character == "\"" && !escaped { return index }
      escaped = character == "\\" && !escaped
    }
    return nil
  }
}
