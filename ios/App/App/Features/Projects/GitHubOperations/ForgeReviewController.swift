import CryptoKit
import Foundation
import Observation

/// One selected review, with the account from its list row carried through every call.
@MainActor @Observable
final class ForgeReviewController {
  private let gateway: (any ForgeReviewGateway)?
  private let cache: ForgeReviewDiskCache
  private var context: GitHubControllerContext?
  private var source: GitHubDocument?
  private var number: Int64 = 0
  private var revision: UInt64 = 0
  private var displayedDiffHash: String?
  private(set) var documents: [ForgeReviewOperation: GitHubDocument] = [:] {
    didSet {
      let diff = documents[.forgeGetPrDiff]?["diff"]?.stringValue
      if diff != oldValue[.forgeGetPrDiff]?["diff"]?.stringValue {
        displayedDiffHash = diff.map { SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined() }
      }
    }
  }
  private(set) var loading = false
  private(set) var mutating = false
  private(set) var failure: GitHubOperationsFailure?
  private(set) var isCached = false

  init(gateway: (any ForgeReviewGateway)?, cache: ForgeReviewDiskCache = ForgeReviewDiskCache()) {
    self.gateway = gateway
    self.cache = cache
  }

  var capabilities: [String: GitHubJSONValue] {
    source?["capabilities"]?.objectValue ?? [:]
  }

  var viewerLogin: String? { source?["account"]?.objectValue?["login"]?.stringValue }

  /// An optional write control (`labels`, `reviewRequests`, `convertToDraft`) is offered only when
  /// the host advertises it for this review, the grant allows writes, and the review is live; a
  /// cached snapshot never offers one.
  func offers(_ capability: String) -> Bool {
    capabilities[capability]?.boolValue == true && !isCached && gateway != nil
      && context?.permits(.operate) == true
  }

  var canMutate: Bool {
    context?.isUsable == true && context?.permits(.operate) == true && !loading && !mutating && !isCached
  }

  func activate(_ value: GitHubControllerContext) {
    guard context != value else { return }
    deactivate()
    context = value
  }

  /// False until `select` has loaded this exact pull request, so a reused controller never
  /// shows or writes the previous review.
  func isSelected(number value: Int64) -> Bool { number == value }

  func deactivate() {
    revision &+= 1
    context = nil
    source = nil
    number = 0
    documents = [:]
    loading = false
    mutating = false
    failure = nil
    isCached = false
  }

  func select(context value: GitHubControllerContext, sourceData: Data, number: Int64) async {
    activate(value)
    if self.number != number {
      revision &+= 1
      documents = [:]
      mutating = false
      isCached = false
      self.source = nil
      self.number = 0
    }
    guard value.permits(.read) else { failure = .capabilityMissing; return }
    guard let rawSource = try? JSONDecoder().decode(GitHubJSONValue.self, from: sourceData)
    else { failure = .invalidResponse; return }
    let source = GitHubDocument(value: rawSource)
    guard
      source["account"]?.objectValue != nil, source["repository"]?.stringValue != nil
    else { failure = .invalidResponse; return }
    if self.source != source || self.number != number {
      revision &+= 1
      documents = [:]
      mutating = false
      self.source = source
      self.number = number
    }
    let owner = revision
    if documents.isEmpty, let payload = payload(), let scope = ForgeReviewDiskCache.scope(value, payload: payload),
      let cached = await cache.read(scope), revision == owner, context == value, !Task.isCancelled {
      documents = cached
      isCached = true
    }
    guard revision == owner, context == value, !Task.isCancelled else { return }
    if !value.isUsable { return }
    await refresh()
  }

  func refresh() async {
    guard !mutating, let context, context.isUsable, context.permits(.read),
      let gateway, let payload = payload()
    else { failure = .notReady; return }
    revision &+= 1
    let owner = revision
    loading = true
    failure = nil
    do {
      var next: [ForgeReviewOperation: GitHubDocument] = [:]
      var operations: [ForgeReviewOperation] = [
        .forgeGetPrDetails, .forgeGetPrFiles, .forgeGetPrDiff, .forgeGetPrReviewComments,
      ]
      if capabilities["viewedFiles"]?.stringValue != nil { operations.append(.forgeGetPrViewedFiles) }
      if capabilities["reviewGuides"]?.boolValue == true { operations.append(.forgeGetPrReviewGuide) }
      for operation in operations {
        next[operation] = try await gateway.callForge(operation, payload: payload, lease: context.lease)
        guard owns(owner, context) else { return }
      }
      documents = next
      loading = false
      isCached = false
      if let scope = ForgeReviewDiskCache.scope(context, payload: payload) { await cache.write(scope, documents: next) }
    } catch {
      guard owns(owner, context) else { return }
      loading = false
      if !(error is CancellationError) { failure = GitHubFailureMapper.map(error) }
    }
  }

  func refreshGuide() async {
    guard !loading, !mutating, let context, context.isUsable, context.permits(.read), let gateway,
      let payload = payload() else { return }
    let owner = revision
    do {
      let result = try await gateway.callForge(.forgeGetPrReviewGuide, payload: payload, lease: context.lease)
      guard owns(owner, context) else { return }
      documents[.forgeGetPrReviewGuide] = result
      if let scope = ForgeReviewDiskCache.scope(context, payload: payload) { await cache.write(scope, documents: documents) }
    } catch {
      guard owns(owner, context), !(error is CancellationError) else { return }
      failure = GitHubFailureMapper.map(error)
    }
  }

  /// Failed or uncertain writes are never automatically sent again.
  @discardableResult
  func mutate(_ operation: ForgeReviewOperation, fields: [String: GitHubJSONValue]) async -> Bool {
    guard canMutate, operation.scope == .operate, let gateway, let context,
      let payload = payload(fields)
    else { return false }
    revision &+= 1
    let owner = revision
    mutating = true
    failure = nil
    do {
      let result = try await gateway.callForge(operation, payload: payload, lease: context.lease)
      guard owns(owner, context) else { return false }
      mutating = false
      if operation == .forgeSetPrFileViewed { documents[.forgeGetPrViewedFiles] = result }
      else if operation == .forgeWritePrReviewGuide { documents[.forgeGetPrReviewGuide] = result }
      else { await refresh() }
      if owns(owner, context), let reviewPayload = self.payload(), let scope = ForgeReviewDiskCache.scope(context, payload: reviewPayload) { await cache.write(scope, documents: documents) }
      return true
    } catch {
      guard owns(owner, context) else { return false }
      mutating = false
      if !(error is CancellationError) { failure = GitHubFailureMapper.map(error) }
      return false
    }
  }

  /// Candidate lookups are live reads: the result never enters `documents`, so it is never cached
  /// or shown offline. Nil when the lookup could not run, was superseded, or failed.
  func candidates(_ operation: ForgeReviewOperation, fields: [String: GitHubJSONValue] = [:]) async -> GitHubDocument? {
    guard operation == .forgeListPrLabelCandidates || operation == .forgeListPrReviewerCandidates,
      let context, context.isUsable, context.permits(.read), !isCached, let gateway, let payload = payload(fields)
    else { return nil }
    let owner = revision
    failure = nil
    do {
      let result = try await gateway.callForge(operation, payload: payload, lease: context.lease)
      return owns(owner, context) ? result : nil
    } catch {
      guard owns(owner, context), !(error is CancellationError) else { return nil }
      failure = GitHubFailureMapper.map(error)
      return nil
    }
  }

  @discardableResult
  func setLabels(add: [String], remove: [String]) async -> Bool {
    guard offers("labels"), !add.isEmpty || !remove.isEmpty else { return false }
    return await mutate(.forgeSetPrLabels, fields: [
      "add": .array(add.map(GitHubJSONValue.string)), "remove": .array(remove.map(GitHubJSONValue.string)),
    ])
  }

  @discardableResult
  func requestReviewers(add: [GitHubReviewerSummary], remove: [GitHubReviewerSummary]) async -> Bool {
    guard offers("reviewRequests"), !add.isEmpty || !remove.isEmpty else { return false }
    return await mutate(.forgeRequestPrReviewers, fields: [
      "add": .array(add.map(\.reference)), "remove": .array(remove.map(\.reference)),
    ])
  }

  @discardableResult
  func convertToDraft() async -> Bool {
    guard offers("convertToDraft") else { return false }
    return await mutate(.forgeConvertPrToDraft, fields: [:])
  }

  func viewedFingerprint(_ path: String) -> String? {
    guard let marks = documents[.forgeGetPrViewedFiles] else { return nil }
    if marks["storage"]?.stringValue == "forge" { return "VIEWED" }
    guard matchesDisplayedDiff(marks) else { return nil }
    return marks["currentFiles"]?.arrayValue?.first {
      $0.objectValue?["path"]?.stringValue == path
    }?.objectValue?["fingerprint"]?.stringValue
  }

  func matchesDisplayedDiff(_ document: GitHubDocument) -> Bool {
    guard let displayedDiffHash else { return false }
    return document["diffHash"]?.stringValue == displayedDiffHash
  }

  func viewedState(_ path: String) -> String? {
    let saved = documents[.forgeGetPrViewedFiles]?["files"]?.arrayValue?.first {
      $0.objectValue?["path"]?.stringValue == path
    }?.objectValue?["fingerprint"]?.stringValue
    guard let saved else { return nil }
    return saved == viewedFingerprint(path) ? "viewed" : "changed"
  }

  private func payload(_ fields: [String: GitHubJSONValue] = [:]) -> GitHubDocument? {
    guard let context, let account = source?["account"],
      let repository = source?["repository"],
      let location = try? JSONDecoder().decode(GitHubJSONValue.self, from: JSONEncoder().encode(context.lease.location))
    else { return nil }
    var value = fields
    value["projectLocation"] = location
    value["forgeAccount"] = account
    value["forgeRepository"] = repository
    value["prNumber"] = .integer(number)
    return GitHubDocument(value: .object(value))
  }

  private func owns(_ owner: UInt64, _ value: GitHubControllerContext) -> Bool {
    revision == owner && context == value && value.isUsable && !Task.isCancelled
  }
}
