import Foundation

enum SettingsSkillScope: String, Codable, CaseIterable, Sendable {
  case global
  case project
}

enum SettingsSkillAvailability: String, Codable, Sendable {
  case shared
  case poracode
}

enum SettingsSkillOrigin: String, Codable, Sendable {
  case managed
  case external
  case builtIn = "built-in"
  case plugin
}

enum SettingsSkillImportMode: String, Codable, CaseIterable, Sendable {
  case copy
  case link
}

enum SettingsSkillImportState: String, Codable, Sendable {
  case available
  case alreadyImported = "already-imported"
  case conflict
}

struct SettingsSkillEntry: Codable, Equatable, Identifiable, Sendable, CustomStringConvertible {
  let id: String
  let name: String
  let descriptionText: String
  let folderName: String
  let absolutePath: String
  let skillFilePath: String
  let rootPath: String
  let providerID: String
  let providerLabel: String
  let providerGroupID: String?
  let providerGroupLabel: String?
  let providerGroupOrder: Int?
  let scope: SettingsSkillScope
  let scopeLabel: String
  let availability: SettingsSkillAvailability?
  let origin: SettingsSkillOrigin
  let pluginID: String?
  let pluginName: String?
  let enabled: Bool
  let mutable: Bool
  let valid: Bool
  let portable: Bool?
  let linked: Bool
  let importState: SettingsSkillImportState?
  let sourcePath: String?
  let invalidReason: String?

  var description: String { "SettingsSkillEntry(id: \(id), enabled: \(enabled))" }

  enum CodingKeys: String, CodingKey {
    case id, name, folderName, absolutePath, skillFilePath, rootPath, scope, scopeLabel
    case availability, origin, enabled, mutable, valid, portable, linked, importState, sourcePath
    case descriptionText = "description"
    case providerID = "providerId"
    case providerLabel
    case providerGroupID = "providerGroupId"
    case providerGroupLabel, providerGroupOrder
    case pluginID = "pluginId"
    case pluginName, invalidReason
  }
}

struct SettingsSkillScanIssue: Codable, Equatable, Sendable, CustomStringConvertible {
  let providerID: String
  let hasDiagnostic: Bool

  var description: String { "SettingsSkillScanIssue(provider: \(providerID), redacted: true)" }

  enum CodingKeys: String, CodingKey {
    case providerID = "providerId"
    case path, message
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    providerID = try values.decode(String.self, forKey: .providerID)
    _ = try values.decode(String.self, forKey: .path)
    _ = try values.decode(String.self, forKey: .message)
    hasDiagnostic = true
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode(providerID, forKey: .providerID)
    try values.encode("redacted", forKey: .path)
    try values.encode("redacted", forKey: .message)
  }
}

struct SettingsSkillScanRequest: Codable, Equatable, Sendable {
  let projectLocation: ProjectLocation?
  let wslDistro: String?
  let agentKind: String?
  let presentationMode: String?
}

struct SettingsSkillScanResult: Codable, Equatable, Sendable {
  let skills: [SettingsSkillEntry]
  let effectiveSkillIDs: [String]
  let invocation: String?
  let issues: [SettingsSkillScanIssue]
  let canLinkToGlobal: Bool

  enum CodingKeys: String, CodingKey {
    case skills, invocation, issues, canLinkToGlobal
    case effectiveSkillIDs = "effectiveSkillIds"
  }
}

struct SettingsSetSkillEnabledRequest: Codable, Equatable, Sendable {
  let absolutePath: String
  let enabled: Bool
  let projectLocation: ProjectLocation?
  let wslDistro: String?
}

struct SettingsDeleteSkillRequest: Codable, Equatable, Sendable {
  let absolutePath: String
  let projectLocation: ProjectLocation?
  let wslDistro: String?
}

struct SettingsImportSkill: Codable, Equatable, Sendable {
  let sourcePath: String
  let sourceProjectLocation: ProjectLocation?
  let sourceWslDistro: String?
  let destinationScope: SettingsSkillScope
  let availability: SettingsSkillAvailability?
  let mode: SettingsSkillImportMode
  let replace: Bool
  let projectLocation: ProjectLocation?
  let wslDistro: String?
}

struct SettingsImportSkillsRequest: Codable, Equatable, Sendable {
  let skills: [SettingsImportSkill]
}

struct SettingsImportSkillsResult: Codable, Equatable, Sendable {
  let imported: [String]
}

enum SettingsSkillMarketplaceID: String, Codable, CaseIterable, Sendable {
  case skillsSH = "skills-sh"
  case skillsDirectory = "skills-directory"
}

enum SettingsSkillMarketplaceSort: String, Codable, CaseIterable, Sendable {
  case rank, stars, recent, votes
}

struct SettingsMarketplaceSkill: Codable, Equatable, Identifiable, Sendable {
  let id: String
  let marketplace: SettingsSkillMarketplaceID
  let name: String
  let description: String?
  let source: String
  let skillID: String
  let sourceURL: String?
  let sourceRef: String?
  let sourcePath: String?
  let installs: Int?
  let weeklyInstalls: [Int]?
  let stars: Int?
  let votes: Int?
  let securityGrade: String?
  let securityScore: Double?
  let updatedAt: String?
  let official: Bool
  let rank: Int

  enum CodingKeys: String, CodingKey {
    case id, marketplace, name, description, source, sourceRef, sourcePath, installs
    case weeklyInstalls, stars, votes, securityGrade, securityScore, updatedAt, official, rank
    case skillID = "skillId"
    case sourceURL = "sourceUrl"
  }
}

struct SettingsSkillMarketplaceRequest: Codable, Equatable, Sendable {
  let marketplace: SettingsSkillMarketplaceID
  let query: String?
  let sort: SettingsSkillMarketplaceSort
}

struct SettingsSkillMarketplaceResult: Codable, Equatable, Sendable {
  let marketplace: SettingsSkillMarketplaceID
  let skills: [SettingsMarketplaceSkill]
  let total: Int
}

struct SettingsInstallMarketplaceSkillRequest: Codable, Equatable, Sendable {
  let marketplace: SettingsSkillMarketplaceID
  let marketplaceSkillID: String
  let destinationScope: SettingsSkillScope
  let availability: SettingsSkillAvailability?
  let replace: Bool
  let projectLocation: ProjectLocation?
  let wslDistro: String?

  enum CodingKeys: String, CodingKey {
    case marketplace, destinationScope, availability, replace, projectLocation, wslDistro
    case marketplaceSkillID = "marketplaceSkillId"
  }
}

struct SettingsInstallMarketplaceSkillResult: Codable, Equatable, Sendable {
  let installed: String
}
