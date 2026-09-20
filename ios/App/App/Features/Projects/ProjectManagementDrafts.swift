import Foundation

enum ProjectCreationKind: String, CaseIterable, Identifiable, Sendable {
  case addExisting
  case create
  case clone

  var id: String { rawValue }
}

enum ProjectDraftError: Error, Equatable, Sendable {
  case pathRequired
  case invalidName(ProjectNameValidationError)
  case invalidCloneURL
  case noChanges
}

struct ProjectCreationDraft: Equatable, Sendable {
  var kind: ProjectCreationKind = .addExisting
  var path = ""
  var name = ""
  var cloneURL = ""

  func command() throws -> ProjectCommand {
    let cleanPath = ProjectValidation.jsTrim(path)
    guard !cleanPath.isEmpty else { throw ProjectDraftError.pathRequired }
    let cleanName = ProjectValidation.jsTrim(name)

    switch kind {
    case .addExisting:
      return .addExisting(path: cleanPath, name: nil)
    case .create:
      if let error = ProjectValidation.projectNameError(cleanName) {
        throw ProjectDraftError.invalidName(error)
      }
      return .create(parentPath: cleanPath, name: cleanName)
    case .clone:
      let cleanURL = ProjectValidation.jsTrim(cloneURL)
      guard ProjectValidation.isSafeCloneURL(cleanURL) else {
        throw ProjectDraftError.invalidCloneURL
      }
      let cloneName = ProjectCloneNaming.folderName(from: cleanURL)
      guard !cloneName.isEmpty else { throw ProjectDraftError.invalidCloneURL }
      if let error = ProjectValidation.projectNameError(cloneName) {
        throw ProjectDraftError.invalidName(error)
      }
      return .clone(parentPath: cleanPath, name: cloneName, source: .url(cleanURL))
    }
  }
}

/// Matches the compact PWA clone flow: the destination folder is derived from
/// the repository URL instead of asking for a second, redundant project name.
enum ProjectCloneNaming {
  static func folderName(from rawURL: String) -> String {
    var value = ProjectValidation.jsTrim(rawURL)
    if let suffixStart = value.firstIndex(where: { $0 == "?" || $0 == "#" }) {
      value = String(value[..<suffixStart])
    }
    if value.lowercased().hasSuffix(".git") {
      value.removeLast(4)
    }
    while let last = value.last, last == "/" || last == "\\" {
      value.removeLast()
    }
    guard !value.isEmpty else { return "" }
    let separator = value.lastIndex(where: { $0 == "/" || $0 == ":" || $0 == "\\" })
    return separator.map { String(value[value.index(after: $0)...]) } ?? value
  }
}

struct ProjectEditDraft: Equatable, Sendable {
  let original: RemoteProject
  var name: String
  var path: String
  var disabled: Bool

  init(project: RemoteProject) {
    original = project
    name = project.name
    path = project.location.hostPath
    disabled = project.disabled ?? false
  }

  func commands() throws -> [ProjectCommand] {
    let cleanName = ProjectValidation.jsTrim(name)
    if let error = ProjectValidation.projectNameError(cleanName) {
      throw ProjectDraftError.invalidName(error)
    }
    let cleanPath = ProjectValidation.jsTrim(path)
    guard !cleanPath.isEmpty else { throw ProjectDraftError.pathRequired }

    var result: [ProjectCommand] = []
    var patch = ProjectPatch()
    if cleanName != original.name { patch.name = .set(cleanName) }
    if disabled != (original.disabled ?? false) { patch.disabled = .set(disabled) }
    if !patch.name.isUnchanged || !patch.disabled.isUnchanged {
      result.append(.update(projectId: original.id, patch: patch))
    }
    if cleanPath != original.location.hostPath {
      result.append(.relocate(projectId: original.id, path: cleanPath))
    }
    guard !result.isEmpty else { throw ProjectDraftError.noChanges }
    return result
  }
}

enum ProjectNoteEditing {
  static func toggling(_ todo: ProjectNoteTodo, in values: [ProjectNoteTodo]) -> [ProjectNoteTodo] {
    values.map { value in
      guard value.id == todo.id else { return value }
      var updated = value
      updated.done.toggle()
      return updated
    }
  }

  static func deleting(_ todo: ProjectNoteTodo, from values: [ProjectNoteTodo])
    -> [ProjectNoteTodo]
  {
    values.filter { $0.id != todo.id }
  }

  static func adding(text: String, to values: [ProjectNoteTodo], now: String, id: String)
    -> [ProjectNoteTodo]
  {
    let cleanText = ProjectValidation.jsTrim(text)
    guard !cleanText.isEmpty else { return values }
    return values + [ProjectNoteTodo(id: id, text: cleanText, done: false, createdAt: now)]
  }
}
