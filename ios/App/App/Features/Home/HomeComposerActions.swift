import Foundation
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

extension HomeQuickComposeView {
  func normalizePresentationMode() {
    guard launchSeed == nil, !supportsPresentationMode(presentationMode) else { return }
    presentationMode = HomeComposerCatalog.preferredPresentationMode(
      from: session.state.replay.agentStatuses.ordered
    )
  }

  func normalizeProject() {
    if !projects.contains(where: { $0.id == projectID }) { projectID = projects.first?.id ?? "" }
  }

  func activateMedia() {
    guard let access = session.currentRichChatAccess else {
      mediaSuite.deselect()
      return
    }
    mediaSuite.select(access: access, threadID: threadID)
  }

  /// Resign the expanded editor before removing it from the hierarchy. If the
  /// conditional surface disappears in the same update, UIKit can retain the
  /// removed text field as first responder and block the next composer.
  func resignPromptFocus() {
    promptFocused = false
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
      resignPromptFocus()
    }
  }

  func start() {
    let typedText = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    let mentionPrompt =
      (fileMentions.map { "@\($0)" } + mentionedMCPs.map { "@\($0.name)" })
      .joined(separator: " ")
    let text = typedText.isEmpty ? launchSeed?.defaultPrompt ?? mentionPrompt : typedText
    guard !text.isEmpty, let project = selectedProject, let defaults,
      let configuration = effectiveConfiguration,
      let target = session.threadLifecycleTarget(threadID: threadID)
    else { return }
    failureMessage = nil
    let attachmentSegments = attachments.map {
      ThreadPromptSegment.attachment(path: $0.remotePath, mimeType: $0.mimeType)
    }
    let segments =
      fileMentions.map(ThreadPromptSegment.file(path:))
      + mentionedMCPs.map { .mcp(id: $0.id, name: $0.name) }
      + skills.map(\.threadSegment)
      + attachmentSegments
    let launchAgentKind = selectedAgent?.kind ?? defaults.agentKind
    Task {
      let worktree: (path: String, branch: String, isNew: Bool)?
      if let selection = branchSelection, let path = selection.worktreePath {
        worktree = (path, selection.branch, false)
      } else if worktreeSelection == .branch {
        worktree = nil
      } else {
        preparingWorktree = true
        let prepared = await prepareWorktree(
          project: project,
          transferChanges: worktreeSelection == .worktreeWithChanges
        )
        preparingWorktree = false
        guard let prepared else { return }
        worktree = (prepared.path, prepared.branch, true)
      }
      lifecycle.activate(target)
      let launchPrompt = (launchSeed?.promptPrefix ?? "") + text
      await lifecycle.relaunch(
        ThreadRelaunchRequest(
          projectID: project.id,
          agentKind: launchAgentKind,
          config: configuration,
          prompt: launchPrompt,
          agentInstanceID: launchAgentKind == defaults.agentKind ? defaults.agentInstanceID : nil,
          focus: true,
          groupID: launchSeed?.groupID,
          groupName: launchSeed?.groupName,
          isNewWorktree: worktree?.isNew == true ? true : nil,
          presentationMode: presentationMode,
          segments: launchSeed?.promptPrefix.map {
            [.text(content: $0), .text(content: text)] + segments
          } ?? (segments.isEmpty ? nil : segments),
          title: launchSeed?.title,
          worktreeBranch: worktree?.branch ?? launchSeed?.worktreeBranch,
          worktreePath: worktree?.path ?? launchSeed?.worktreePath
        ),
        target: target
      )
      switch lifecycle.lastOutcome {
      case .succeeded:
        await session.refreshSnapshot()
        prompt = ""
        attachments = []
        skills = []
        fileMentions = []
        mentionedMCPs = []
        collapseComposer(animated: false)
        onStarted(target.threadID)
        threadID = UUID().uuidString.lowercased()
        activateMedia()
      case .failed(_, let failure):
        failureMessage = ThreadLifecycleStrings.failureMessage(failure)
      case nil:
        break
      }
    }
  }

  func prepareWorktree(
    project: RemoteProject,
    transferChanges: Bool
  ) async -> (path: String, branch: String)? {
    let branch = worktreeBranchName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !branch.isEmpty else {
      failureMessage = GitOperationsStrings.unavailable
      return nil
    }
    guard let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else {
      failureMessage = GitOperationsStrings.unavailable
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
          startPoint: branchSelection?.branch,
          transferUncommitted: transferChanges ? true : nil
        )
      )
    )
    if case .addWorktree(let result) = controller.state.lastResult {
      return (result.path, branch)
    }
    failureMessage =
      controller.state.failure.map(GitOperationsStrings.failure)
      ?? GitOperationsStrings.unavailable
    return nil
  }

  func loadBranches() async {
    guard branchProjectID != projectID, !loadingBranches, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else { return }
    loadingBranches = true
    failureMessage = nil
    defer { loadingBranches = false }

    let controller = operation.controller
    controller.activate(context)
    await controller.read(
      .gitListBranches(.init(projectLocation: project.location, includeRemote: true))
    )
    let branches = controller.state.authoritative.branches?.branches ?? []
    await controller.read(.gitListWorktrees(.init(projectLocation: project.location)))
    if let failure = controller.state.failure {
      failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    var seenBranches = Set<String>()
    branchOptions = (branches.filter { !$0.isRemote } + branches.filter(\.isRemote)).filter {
      seenBranches.insert($0.name).inserted
    }
    worktreeOptions = controller.state.authoritative.worktrees ?? []
    branchProjectID = project.id
  }

  func selectBranch(
    _ branch: ProjectGitBranchInfo,
    worktree: ProjectGitWorktreeInfo?
  ) async {
    if let worktree, !worktree.isMain {
      selectWorktree(worktree)
      return
    }

    if worktreeSelection != .branch {
      branchSelection = HomeComposerBranchSelection(branch: branch.name)
      selector = nil
      return
    }

    guard !branch.current, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else {
      branchSelection = HomeComposerBranchSelection(branch: branch.name)
      selector = nil
      return
    }

    switchingBranch = branch.name
    failureMessage = nil
    defer { switchingBranch = nil }
    let controller = operation.controller
    controller.activate(context)
    await controller.submit(
      .gitSwitchBranch(
        .init(projectLocation: project.location, branch: branch.name, createNew: false)
      )
    )
    if let failure = controller.state.failure {
      failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    branchSelection = HomeComposerBranchSelection(branch: branch.name)
    branchOptions = branchOptions.map {
      ProjectGitBranchInfo(
        name: $0.name,
        current: $0.name == branch.name,
        commit: $0.commit,
        isRemote: $0.isRemote,
        remote: $0.remote
      )
    }
    selector = nil
  }

  func selectWorktree(_ worktree: ProjectGitWorktreeInfo) {
    if worktree.isMain {
      branchSelection = HomeComposerBranchSelection(branch: worktree.branch)
      worktreeSelection = .branch
    } else {
      branchSelection = HomeComposerBranchSelection(
        branch: worktree.branch,
        worktreePath: worktree.path
      )
      worktreeSelection = .worktree
    }
    selector = nil
  }

  func createBranch() async {
    let name = newBranchName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, let project = selectedProject,
      let operation = gitController(for: project),
      let context = operation.source.gitOperationsContext
    else { return }
    switchingBranch = name
    failureMessage = nil
    defer { switchingBranch = nil }
    let controller = operation.controller
    controller.activate(context)
    await controller.submit(
      .gitSwitchBranch(.init(projectLocation: project.location, branch: name, createNew: true))
    )
    if let failure = controller.state.failure {
      failureMessage = GitOperationsStrings.failure(failure)
      return
    }
    branchSelection = HomeComposerBranchSelection(branch: name)
    newBranchName = ""
    creatingBranch = false
    selector = nil
  }

  private func gitController(
    for project: RemoteProject
  ) -> (controller: GitOperationsController, source: ProjectWorkspaceSelectionSource)? {
    guard let connectionID = session.state.selectedConnectionId else { return nil }
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
    importing = true
    failureMessage = nil
    defer { importing = false }
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
        failureMessage = RichChatStrings.invalidAttachment
        return
      }
      let data = try Data(contentsOf: url, options: [.mappedIfSafe])
      let name = values.name ?? url.lastPathComponent
      let mime = values.contentType?.preferredMIMEType ?? "application/octet-stream"
      await uploadAttachment(data: data, name: name, mimeType: mime)
    } catch {
      failureMessage = RichChatStrings.uploadFailed
    }
  }

  func upload(_ item: PhotosPickerItem, kind: HomeComposerPhotoKind) async {
    importing = true
    failureMessage = nil
    defer { importing = false }
    do {
      guard let data = try await item.loadTransferable(type: Data.self) else {
        failureMessage = RichChatStrings.uploadFailed
        return
      }
      let type = item.supportedContentTypes.first ?? .jpeg
      let suffix = type.preferredFilenameExtension ?? "jpg"
      await uploadAttachment(
        data: data,
        name: "\(kind.filenamePrefix)-\(UUID().uuidString.lowercased()).\(suffix)",
        mimeType: type.preferredMIMEType ?? "image/jpeg"
      )
      if failureMessage == nil { selector = nil }
    } catch {
      failureMessage = RichChatStrings.uploadFailed
    }
  }

  func uploadCapturedPhoto(_ data: Data) async {
    importing = true
    failureMessage = nil
    defer { importing = false }
    await uploadAttachment(
      data: data,
      name: "photo-\(UUID().uuidString.lowercased()).jpg",
      mimeType: "image/jpeg"
    )
  }

  private func uploadAttachment(data: Data, name: String, mimeType: String) async {
    guard RichAttachmentPolicy.evaluate(name: name, byteCount: Int64(data.count)).accepted else {
      failureMessage = RichChatStrings.invalidAttachment
      return
    }
    await mediaSuite.media.upload(
      RichChatMediaController.attachmentPlan(name: name, contentType: mimeType, data: data)
    )
    guard mediaSuite.media.state.failure == nil,
      let path = mediaSuite.media.state.uploadedAttachmentPath
    else {
      failureMessage =
        mediaSuite.media.state.failure.map(RichChatStrings.failure)
        ?? RichChatStrings.uploadFailed
      return
    }
    attachments.append(
      RichChatUploadedAttachment(name: name, mimeType: mimeType, remotePath: path)
    )
  }
}
