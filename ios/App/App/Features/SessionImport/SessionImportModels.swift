import Foundation

/// Display projections of the generated, validated import listing. Session paths
/// belong to the selected host and are never read by the native client.
struct ImportableCLISession: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let agentKind: String
  let providerSessionId: String
  let path: String
  let cwd: String?
  let updatedAt: String
  let preview: String
  let title: String?
  let model: String?
  let cwdExists: Bool

  var displayTitle: String { SessionImportPresentation.nonEmpty(title) ?? SessionImportPresentation.nonEmpty(preview) ?? providerSessionId }
}

struct SessionImportListing: Decodable, Sendable {
  struct Facets: Decodable, Equatable, Sendable {
    let agentKinds: [String]
    let folders: [String]
  }
  let sessions: [ImportableCLISession]
  let facets: Facets
  let truncated: Bool
  var superseded: Bool? = nil
}

struct SessionImportFilter: Encodable, Equatable, Hashable, Sendable {
  var agentKind: String? = nil
  var cwd: String? = nil
  var query: String? = nil

  var normalized: Self {
    .init(agentKind: SessionImportPresentation.nonEmpty(agentKind), cwd: SessionImportPresentation.nonEmpty(cwd),
      query: SessionImportPresentation.nonEmpty(query?.trimmingCharacters(in: .whitespacesAndNewlines)))
  }

  func includes(_ session: ImportableCLISession) -> Bool {
    let filter = normalized
    if let agentKind = filter.agentKind, agentKind != session.agentKind { return false }
    if let cwd = filter.cwd, cwd != session.cwd { return false }
    guard let needle = filter.query?.lowercased() else { return true }
    return [session.title, session.preview, session.cwd].contains { $0?.lowercased().contains(needle) == true }
  }
}

struct SessionImportCommand: Encodable, Sendable {
  let projectId: String
  let agentKind: String
  let model: String
  let title: String
  let path: String
  let providerSessionId: String
  let kind = "import-session"
}

enum SessionImportFailure: Error, Equatable, Sendable {
  case unavailable(SettingsOperationFailure)
  case unsupported
  case missingProject
  case missingModel
  case ambiguousOutcome
  case threadAlreadyExists
}

enum SessionImportPresentation {
  static func nonEmpty(_ value: String?) -> String? {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return value
  }
  static func importedThread(_ session: ImportableCLISession, threads: [RemoteThread]) -> String? {
    threads.first {
      $0.config.importedFrom?.path == session.path
        || ($0.agentKind == session.agentKind && $0.sessionRef?.providerSessionID == session.providerSessionId)
    }?.id
  }

  static func model(_ session: ImportableCLISession, project: RemoteProject?, agents: [AgentStatusRecord]) -> String? {
    let agent = agents.first { $0.kind == session.agentKind }
    let offered = agent.map { HomeComposerCatalog.models(for: $0, presentationMode: .gui).map(\.modelID) } ?? []
    if let model = session.model, offered.contains(model) { return model }
    if let draft = project?.lastDraftConfig?.objectValue,
      draft["agentKind"]?.stringValue == session.agentKind,
      let model = draft["model"]?.stringValue, offered.contains(model) { return model }
    return offered.first ?? nonEmpty(session.model)
  }

  static func title(_ session: ImportableCLISession) -> String {
    let candidate = (session.title ?? session.preview).trimmingCharacters(in: .whitespacesAndNewlines)
    let title = candidate.isEmpty ? SessionImportStrings.importedSession : candidate
    return title.utf16.count > 60 ? String(decoding: title.utf16.prefix(60), as: UTF16.self) + "…" : title
  }
}
