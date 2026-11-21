import Foundation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

extension HomeQuickComposeView {
  func normalizePresentationMode() {
    guard ownsCurrentConnection, launchSeed == nil, !supportsPresentationMode(draft.presentationMode) else { return }
    draft.presentationMode = HomeComposerCatalog.preferredPresentationMode(
      from: session.state.replay.agentStatuses.ordered
    )
  }

  func normalizeProject() {
    guard ownsCurrentConnection else { return }
    if !projects.contains(where: { $0.id == draft.projectID }) { draft.projectID = projects.first?.id ?? "" }
  }

  func activateMedia() {
    draft.synchronizeMedia(access: session.currentRichChatAccess, presentation: presentationID)
  }

  /// Resign the expanded editor before removing it from the hierarchy. If the
  /// conditional surface disappears in the same update, UIKit can retain the
  /// removed text field as first responder and block the next composer.
  func resignPromptFocus() {
    draft.promptFocused = false
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows {
        window.endEditing(true)
      }
    }
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder),
      to: nil,
      from: nil,
      for: nil
    )
  }

  func collapseComposer(animated: Bool = true) {
    resignPromptFocus()
    if animated {
      withAnimation(.snappy(duration: 0.2)) { isExpanded = false }
    } else {
      isExpanded = false
    }
    DispatchQueue.main.async {
      // SwiftUI can retain the outgoing text field for the navigation animation.
      // Repeat dismissal after the hierarchy has committed the collapsed state.
      if !isExpanded { resignPromptFocus() }
    }
  }

  func start() {
    let providerSwitch = draft.providerSwitch
    let presentationMode = draft.presentationMode
    let typedText = draft.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let mentionPrompt =
      (draft.fileMentions.map { "@\($0)" } + draft.mentionedMCPs.map { "@\($0.name)" } + draft.skills.map(\.invocation)
        + draft.additionalSegments.compactMap(\.promptText))
      .joined(separator: " ")
    let defaultPrompt = providerSwitch != nil && launchSeed?.promptPrefix == nil
      ? "Continue where the previous provider left off." : launchSeed?.defaultPrompt
    let text = typedText.isEmpty ? defaultPrompt ?? mentionPrompt : typedText
    guard canStart, RichPromptSegment.isSendable(prompt: text, segments: draft.additionalSegments) || !draft.attachments.isEmpty,
      let project = selectedProject, let launchAgent = selectedAgent,
      let configuration = effectiveConfiguration,
      let settings = draft.tools.document.document,
      let target = session.threadLifecycleTarget(threadID: draft.launchThreadID)
    else { return }
    let launchConfiguration = ComposerPluginCatalog.launchConfiguration(configuration, document: settings,
      capabilities: selectedAgent.map { HomeComposerCatalog.capabilities(for: $0, presentationMode: draft.presentationMode) } ?? [:],
      presentation: draft.presentationMode, location: project.location,
      mentionedIDs: Set(draft.mentionedMCPs.map(\.id)))
    draft.failureMessage = nil
    let attachments = draft.attachments
    let textSegments: [ThreadPromptSegment] = if !typedText.isEmpty {
      [.text(content: draft.prompt)]
    } else if defaultPrompt != nil {
      [.text(content: text)]
    } else {
      []
    }
    let additional: [ThreadPromptSegment]
    do { additional = try draft.additionalSegments.map { try $0.lifecyclePromptSegment() } }
    catch { draft.failureMessage = ThreadLifecycleStrings.failureMessage(.invalidRequest); return }
    let contextSegments =
      draft.fileMentions.map(ThreadPromptSegment.file(path:))
      + draft.mentionedMCPs.map { .mcp(id: $0.id, name: $0.name) }
      + draft.skills.map(\.threadSegment)
      + additional
    let separatedContext = contextSegments.flatMap { [$0, ThreadPromptSegment.text(content: " ")] }
    let launchAgentKind = launchAgent.kind
    let launchAgentInstanceID = composerAgentInstanceID
    draft.starting = true
    Task {
      defer { draft.starting = false }
      guard let attachmentSegments = await launchAttachments(attachments, target: target),
        session.currentThreadHostLease == target.lease, draft.presentationMode == presentationMode
      else { return }
      let segments = separatedContext + textSegments + attachmentSegments
      let launchPrompt = (launchSeed?.promptPrefix ?? "") + text
      let launchSegments = launchSeed?.promptPrefix.map {
        [.text(content: $0), .text(content: text), .text(content: " ")]
          + separatedContext + attachmentSegments
      } ?? (segments.isEmpty ? nil : segments)
      if let providerSwitch {
        guard isCurrentPresentation, providerSwitch.target == target,
          var request = session.threadStartExistingRequest(threadID: target.threadID, prompt: launchPrompt),
          request.agentKind == providerSwitch.agentKind, request.presentationMode == .gui
        else { return }
        request.agentKind = launchAgentKind
        request.agentInstanceID = launchAgentInstanceID
        request.config = launchConfiguration
        request.presentationMode = .gui
        request.sessionReference = nil
        request.segments = launchSegments
        request.providerSwitch = ThreadProviderSwitch(fromAgentKind: providerSwitch.agentKind,
          contextStrategy: launchSeed?.promptPrefix == nil ? .threadTranscript : .contextFile)
        draft.lifecycle.activate(target)
        await draft.lifecycle.start(request, target: target)
        await finishLaunch(target: target)
        return
      }
      let worktree: (path: String, branch: String, isNew: Bool)?
      if let selection = draft.branchSelection, let path = selection.worktreePath {
        worktree = (path, selection.branch, false)
      } else if draft.worktreeSelection == .branch {
        worktree = nil
      } else {
        draft.preparingWorktree = true
        let prepared = await prepareWorktree(
          project: project,
          transferChanges: draft.worktreeSelection == .worktreeWithChanges
        )
        draft.preparingWorktree = false
        guard let prepared else { return }
        worktree = (prepared.path, prepared.branch, true)
      }
      guard session.currentThreadHostLease == target.lease else { return }
      draft.lifecycle.activate(target)
      await draft.lifecycle.relaunch(
        ThreadRelaunchRequest(
          projectID: project.id,
          agentKind: launchAgentKind,
          config: launchConfiguration,
          prompt: launchPrompt,
          agentInstanceID: launchAgentInstanceID,
          focus: launchSeed?.parentThreadID == nil,
          groupID: launchSeed?.groupID,
          groupName: launchSeed?.groupName,
          isNewWorktree: worktree?.isNew == true ? true : nil,
          parentThreadID: launchSeed?.parentThreadID,
          presentationMode: presentationMode,
          segments: launchSegments,
          title: launchSeed?.title,
          worktreeBranch: worktree?.branch ?? launchSeed?.worktreeBranch,
          worktreePath: worktree?.path ?? launchSeed?.worktreePath
        ),
        target: target
      )
      await finishLaunch(target: target)
    }
  }

  private func finishLaunch(target: ThreadLifecycleTarget) async {
    switch draft.lifecycle.lastOutcome {
    case .succeeded:
      if session.currentThreadHostLease == target.lease { await session.refreshSnapshot() }
      draft.clearSubmittedContent()
      if session.currentThreadHostLease == target.lease {
        if isCurrentPresentation { collapseComposer(animated: false) }
        onStarted(target.threadID)
      }
      draft.threadID = UUID().uuidString.lowercased()
      activateMedia()
    case .failed(_, let failure):
      draft.failureMessage = launchSeed?.failureMessage?(failure) ?? ThreadLifecycleStrings.failureMessage(failure)
    case nil:
      break
    }
  }

  private func launchAttachments(_ attachments: [HomeComposerAttachment], target: ThreadLifecycleTarget) async -> [ThreadPromptSegment]? {
    do {
      return try await draft.materializeAttachments(attachments, for: target.threadID) { attachment in
        guard session.currentThreadHostLease == target.lease,
          let access = session.currentRichChatAccess, let data = attachment.data else { throw CancellationError() }
        let media = draft.mediaSuite.media
        draft.mediaSuite.select(access: access, threadID: target.threadID)
        await media.upload(RichChatMediaController.attachmentPlan(
          name: attachment.name, contentType: attachment.mimeType, data: data
        ))
        guard session.currentThreadHostLease == target.lease else { throw CancellationError() }
        guard media.state.failure == nil, let uploaded = media.state.uploadedAttachmentPath else {
          throw media.state.failure ?? RichChatControllerFailure.invalidResponse
        }
        return uploaded
      }
    } catch is CancellationError {
      return nil
    } catch {
      draft.failureMessage = (error as? RichChatControllerFailure).map(RichChatStrings.failure) ?? RichChatStrings.uploadFailed
      return nil
    }
  }

  func prepareWorktree(
    project: RemoteProject,
    transferChanges: Bool
  ) async -> (path: String, branch: String)? {
    let branch = draft.worktreeBranchName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !branch.isEmpty else {
      draft.failureMessage = GitOperationsStrings.unavailable
      return nil
    }
    guard let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else {
      draft.failureMessage = GitOperationsStrings.unavailable
      return nil
    }
    let controller = operation.controller
    controller.activate(context)
    await controller.submit(
      .gitAddWorktree(
        GitAddWorktreeRequest(
          projectLocation: project.location,
          branch: branch,
          createBranch: true,
          keepChangesInSource: transferChanges ? true : nil,
          startPoint: draft.branchSelection?.branch,
          transferUncommitted: transferChanges ? true : nil
        )
      )
    )
    if case .addWorktree(let result) = controller.state.lastResult {
      return (result.path, branch)
    }
    draft.failureMessage =
      controller.state.failure.map(GitOperationsStrings.failure)
      ?? GitOperationsStrings.unavailable
    return nil
  }

  func loadBranches() async {
    guard draft.branchProjectID != draft.projectID, !draft.loadingBranches, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else { return }
    draft.loadingBranches = true
    draft.failureMessage = nil
    defer { draft.loadingBranches = false }

    let controller = operation.controller
    controller.activate(context)
    await controller.read(
      .gitListBranches(.init(projectLocation: project.location, includeRemote: true))
    )
    let branches = controller.state.authoritative.branches?.branches ?? []
    await controller.read(.gitListWorktrees(.init(projectLocation: project.location)))
    if let failure = controller.state.failure {
      draft.failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    var seenBranches = Set<String>()
    draft.branchOptions = (branches.filter { !$0.isRemote } + branches.filter(\.isRemote)).filter {
      seenBranches.insert($0.name).inserted
    }
    draft.worktreeOptions = controller.state.authoritative.worktrees ?? []
    draft.branchProjectID = project.id
  }

  func selectBranch(
    _ branch: ProjectGitBranchInfo,
    worktree: ProjectGitWorktreeInfo?
  ) async {
    if let worktree, !worktree.isMain {
      selectWorktree(worktree)
      return
    }

    if draft.worktreeSelection != .branch {
      draft.branchSelection = HomeComposerBranchSelection(branch: branch.name)
      draft.selector = nil
      return
    }

    guard !branch.current, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else {
      draft.branchSelection = HomeComposerBranchSelection(branch: branch.name)
      draft.selector = nil
      return
    }

    draft.switchingBranch = branch.name
    draft.failureMessage = nil
    defer { draft.switchingBranch = nil }
    let controller = operation.controller
    controller.activate(context)
    await controller.submit(
      .gitSwitchBranch(
        .init(projectLocation: project.location, branch: branch.name, createNew: false)
      )
    )
    if let failure = controller.state.failure {
      draft.failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    draft.branchSelection = HomeComposerBranchSelection(branch: branch.name)
    draft.branchOptions = draft.branchOptions.map {
      ProjectGitBranchInfo(
        name: $0.name,
        current: $0.name == branch.name,
        commit: $0.commit,
        isRemote: $0.isRemote,
        remote: $0.remote
      )
    }
    draft.selector = nil
  }

  func selectWorktree(_ worktree: ProjectGitWorktreeInfo) {
    if worktree.isMain {
      draft.branchSelection = HomeComposerBranchSelection(branch: worktree.branch)
      draft.worktreeSelection = .branch
    } else {
      draft.branchSelection = HomeComposerBranchSelection(
        branch: worktree.branch,
        worktreePath: worktree.path
      )
      draft.worktreeSelection = .worktree
    }
    draft.selector = nil
  }

  func createBranch() async {
    let name = draft.newBranchName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else { return }
    draft.switchingBranch = name
    draft.failureMessage = nil
    defer { draft.switchingBranch = nil }
    let controller = operation.controller
    controller.activate(context)
    await controller.submit(
      .gitSwitchBranch(.init(projectLocation: project.location, branch: name, createNew: true))
    )
    if let failure = controller.state.failure {
      draft.failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    draft.branchSelection = HomeComposerBranchSelection(branch: name)
    draft.newBranchName = ""
    draft.creatingBranch = false
    draft.selector = nil
  }

  private func gitController(
    for project: RemoteProject
  ) -> (controller: GitOperationsController, source: ProjectWorkspaceSelectionSource)? {
    guard ownsCurrentConnection, let connectionID = draft.connectionID else { return nil }
    let source = ProjectWorkspaceSelectionSource(
      session: session,
      identity: project.identity(on: connectionID),
      location: project.location
    )
    let gateway = SelectedGitOperationsGateway { @MainActor [weak source] in
      source?.gitOperationsSelection
    }
    return (GitOperationsController(gateway: gateway), source)
  }

  func upload(_ url: URL) async {
    draft.importing = true
    draft.failureMessage = nil
    defer { draft.importing = false }
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    do {
      let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
      guard let size = values.fileSize,
        RichAttachmentPolicy.evaluate(
          name: values.name ?? url.lastPathComponent,
          byteCount: Int64(size)
        ).accepted
      else {
        draft.failureMessage = RichChatStrings.invalidAttachment
        return
      }
      let data = try Data(contentsOf: url, options: launchSeed?.providerSwitchSource == nil ? [.mappedIfSafe] : [])
      let name = values.name ?? url.lastPathComponent
      let mime = values.contentType?.preferredMIMEType ?? "application/octet-stream"
      await uploadAttachment(data: data, name: name, mimeType: mime)
    } catch {
      draft.failureMessage = RichChatStrings.uploadFailed
    }
  }

  func upload(_ item: PhotosPickerItem, kind: HomeComposerPhotoKind) async {
    draft.importing = true
    draft.failureMessage = nil
    defer { draft.importing = false }
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        draft.failureMessage = RichChatStrings.uploadFailed
        return
      }
      let type = item.supportedContentTypes.first ?? .jpeg
      let suffix = type.preferredFilenameExtension ?? "jpg"
      await uploadAttachment(
        data: data,
        name: "\(kind.filenamePrefix)-\(UUID().uuidString.lowercased()).\(suffix)",
        mimeType: type.preferredMIMEType ?? "image/jpeg"
      )
      if draft.failureMessage == nil { draft.selector = nil }
    } catch {
      draft.failureMessage = RichChatStrings.uploadFailed
    }
  }

  func uploadCapturedPhoto(_ data: Data) async {
    draft.importing = true
    draft.failureMessage = nil
    defer { draft.importing = false }
    await uploadAttachment(
      data: data,
      name: "photo-\(UUID().uuidString.lowercased()).jpg",
      mimeType: "image/jpeg"
    )
  }

  private func uploadAttachment(data: Data, name: String, mimeType: String) async {
    guard !draft.starting, ownsCurrentConnection else { return }
    let plan = RichChatMediaController.attachmentPlan(name: name, contentType: mimeType, data: data)
    guard plan.decision.accepted else {
      draft.failureMessage = RichChatStrings.invalidAttachment
      return
    }
    if launchSeed?.providerSwitchSource != nil {
      draft.attachments.append(HomeComposerAttachment(name: name, mimeType: mimeType, data: data))
      return
    }
    await draft.mediaSuite.media.upload(plan)
    guard draft.mediaSuite.media.state.failure == nil,
      let path = draft.mediaSuite.media.state.uploadedAttachmentPath
    else {
      draft.failureMessage =
        draft.mediaSuite.media.state.failure.map(RichChatStrings.failure)
        ?? RichChatStrings.uploadFailed
      return
    }
    draft.attachments.append(
      HomeComposerAttachment(name: name, mimeType: mimeType, remotePath: path)
    )
  }
}
