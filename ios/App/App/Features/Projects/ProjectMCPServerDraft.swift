import Foundation

enum ProjectMCPTransportKind: String, CaseIterable, Identifiable {
  case stdio
  case http
  case sse

  var id: Self { self }
}

enum ProjectMCPDraftError: Error, Equatable {
  case nameRequired
  case nameInvalid
  case nameReserved
  case nameDuplicate
  case commandRequired
  case urlRequired
  case urlInvalid
  case environmentInvalid
  case headersInvalid
  case timeoutInvalid
}

struct ProjectMCPServerDraft: Equatable, CustomStringConvertible, CustomDebugStringConvertible {
  var id: String
  var name: String
  var descriptionText: String
  var enabled: Bool
  var timeoutText: String
  var transportKind: ProjectMCPTransportKind
  var command: String
  var argumentsText: String
  var environmentText: String
  var workingDirectory: String
  var url: String
  var headersText: String
  var disabledTools: [String]?

  var description: String {
    "ProjectMCPServerDraft(id: \(id), transport: \(transportKind.rawValue), sensitive: <redacted>)"
  }

  var debugDescription: String { description }

  init(id: String = UUID().uuidString) {
    self.id = id
    name = ""
    descriptionText = ""
    enabled = true
    timeoutText = "30000"
    transportKind = .stdio
    command = ""
    argumentsText = ""
    environmentText = ""
    workingDirectory = ""
    url = ""
    headersText = ""
    disabledTools = nil
  }

  init(server: ProjectMCPServer) {
    id = server.id
    name = server.name
    descriptionText = server.descriptionText
    enabled = server.enabled
    timeoutText = String(server.timeoutMs)
    disabledTools = server.disabledTools
    switch server.transport {
    case .stdio(let command, let arguments, let environment, let cwd):
      transportKind = .stdio
      self.command = command
      argumentsText = ProjectMCPDraftParsing.argumentsText(arguments)
      environmentText = ProjectMCPDraftParsing.recordText(environment, separator: "=")
      workingDirectory = cwd ?? ""
      url = ""
      headersText = ""
    case .http(let url, let headers):
      transportKind = .http
      command = ""
      argumentsText = ""
      environmentText = ""
      workingDirectory = ""
      self.url = url
      headersText = ProjectMCPDraftParsing.recordText(headers, separator: ": ")
    case .sse(let url, let headers):
      transportKind = .sse
      command = ""
      argumentsText = ""
      environmentText = ""
      workingDirectory = ""
      self.url = url
      headersText = ProjectMCPDraftParsing.recordText(headers, separator: ": ")
    }
  }

  func server(
    existingNames: Set<String>,
    previousName: String?
  ) throws(ProjectMCPDraftError) -> ProjectMCPServer {
    let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedName.isEmpty else { throw .nameRequired }
    guard ProjectMCPDraftParsing.isValidName(normalizedName) else { throw .nameInvalid }
    guard !ProjectMCPDraftParsing.isReservedName(normalizedName) else { throw .nameReserved }
    if normalizedName.lowercased()
      != previousName?.trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased(), existingNames.contains(normalizedName.lowercased())
    {
      throw .nameDuplicate
    }
    guard let timeout = Int(timeoutText), timeout > 0 else { throw .timeoutInvalid }

    let transport: ProjectMCPTransport
    switch transportKind {
    case .stdio:
      let command = command.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !command.isEmpty else { throw .commandRequired }
      guard
        let environment = ProjectMCPDraftParsing.record(
          environmentText, separator: "="
        )
      else { throw .environmentInvalid }
      transport = .stdio(
        command: command,
        args: ProjectMCPDraftParsing.arguments(argumentsText),
        env: environment,
        cwd: ProjectMCPDraftParsing.nonempty(workingDirectory)
      )
    case .http, .sse:
      let url = url.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !url.isEmpty else { throw .urlRequired }
      guard ProjectMCPDraftParsing.isValidURL(url) else { throw .urlInvalid }
      guard let headers = ProjectMCPDraftParsing.record(headersText, separator: ":") else {
        throw .headersInvalid
      }
      transport =
        transportKind == .http
        ? .http(url: url, headers: headers)
        : .sse(url: url, headers: headers)
    }

    return ProjectMCPServer(
      id: id,
      name: normalizedName,
      descriptionText: descriptionText.trimmingCharacters(in: .whitespacesAndNewlines),
      enabled: enabled,
      timeoutMs: timeout,
      disabledTools: disabledTools,
      transport: transport
    )
  }
}

enum ProjectMCPDraftParsing {
  private static let reservedNames = Set([
    "browser", "crossagents", "chrome", "computer_use", "poracode",
  ])

  static func isValidName(_ value: String) -> Bool {
    value.range(
      of: #"^[A-Za-z0-9][A-Za-z0-9_.-]*$"#,
      options: .regularExpression
    ) != nil
  }

  static func isReservedName(_ value: String) -> Bool {
    reservedNames.contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
  }

  static func isValidURL(_ value: String) -> Bool {
    guard let components = URLComponents(string: value),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      components.host?.isEmpty == false
    else { return false }
    return true
  }

  static func nonempty(_ value: String) -> String? {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized.isEmpty ? nil : normalized
  }

  static func arguments(_ value: String) -> [String] {
    var arguments: [String] = []
    var current = ""
    var quote: Character?
    var tokenStarted = false
    let characters = Array(value)
    var index = 0

    func appendCurrent() {
      guard tokenStarted else { return }
      arguments.append(current)
      current = ""
      tokenStarted = false
    }

    while index < characters.count {
      let character = characters[index]
      if quote == "\"", character == "\\" {
        let nextIndex = index + 1
        guard nextIndex < characters.count else {
          current.append(character)
          index += 1
          continue
        }
        let escaped = characters[nextIndex]
        if escaped == "\"" || escaped == "\\" {
          current.append(escaped)
          index += 2
        } else {
          current.append(character)
          index += 1
        }
        continue
      }
      if let activeQuote = quote {
        if character == activeQuote { quote = nil } else { current.append(character) }
        index += 1
        continue
      }
      if character == "\"" || character == "'" {
        quote = character
        tokenStarted = true
      } else if character.isWhitespace {
        appendCurrent()
      } else {
        current.append(character)
        tokenStarted = true
      }
      index += 1
    }
    appendCurrent()
    return arguments
  }

  static func argumentsText(_ arguments: [String]) -> String {
    arguments.map { argument in
      guard argument.isEmpty || argument.contains(where: { $0.isWhitespace || $0 == "\"" }) else {
        return argument
      }
      let escaped = argument.replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
      return "\"\(escaped)\""
    }.joined(separator: " ")
  }

  static func record(_ value: String, separator: Character) -> SensitiveStringMap? {
    var result: [String: String] = [:]
    for line in value.components(separatedBy: .newlines) {
      let normalized = line.trimmingCharacters(in: .whitespacesAndNewlines)
      if normalized.isEmpty { continue }
      guard let separatorIndex = normalized.firstIndex(of: separator) else { return nil }
      let key = normalized[..<separatorIndex].trimmingCharacters(in: .whitespacesAndNewlines)
      guard !key.isEmpty else { return nil }
      let afterSeparator = normalized.index(after: separatorIndex)
      let itemValue = normalized[afterSeparator...]
        .trimmingCharacters(in: .whitespacesAndNewlines)
      result[key] = itemValue
    }
    return SensitiveStringMap(result)
  }

  static func recordText(_ value: SensitiveStringMap, separator: String) -> String {
    value.keys.compactMap { key in
      value.secretValue(forKey: key).map { "\(key)\(separator)\($0)" }
    }.joined(separator: "\n")
  }
}

extension SettingsMCPServer {
  init(projectServer: ProjectMCPServer) {
    id = projectServer.id
    name = projectServer.name
    descriptionText = projectServer.descriptionText
    enabled = projectServer.enabled
    timeoutMs = projectServer.timeoutMs
    disabledTools = projectServer.disabledTools
    switch projectServer.transport {
    case .stdio(let command, let args, let environment, let cwd):
      transport = .stdio(
        command: command,
        args: args,
        environment: ProjectMCPDraftParsing.dictionary(environment),
        cwd: cwd
      )
    case .http(let url, let headers):
      transport = .http(url: url, headers: ProjectMCPDraftParsing.dictionary(headers))
    case .sse(let url, let headers):
      transport = .sse(url: url, headers: ProjectMCPDraftParsing.dictionary(headers))
    }
  }
}

extension ProjectMCPServer {
  init(imported server: SettingsMCPServer, id: String? = nil) {
    self.id = id ?? server.id
    name = server.name
    descriptionText = server.descriptionText
    enabled = server.enabled
    timeoutMs = server.timeoutMs
    disabledTools = server.disabledTools
    switch server.transport {
    case .stdio(let command, let args, let environment, let cwd):
      transport = .stdio(
        command: command,
        args: args,
        env: SensitiveStringMap(environment),
        cwd: cwd
      )
    case .http(let url, let headers):
      transport = .http(url: url, headers: SensitiveStringMap(headers))
    case .sse(let url, let headers):
      transport = .sse(url: url, headers: SensitiveStringMap(headers))
    }
  }
}

extension ProjectMCPDraftParsing {
  static func dictionary(_ value: SensitiveStringMap) -> [String: String] {
    Dictionary(
      uniqueKeysWithValues: value.keys.compactMap { key in
        value.secretValue(forKey: key).map { (key, $0) }
      })
  }
}
