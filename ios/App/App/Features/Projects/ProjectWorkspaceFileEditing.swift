import SwiftUI

extension ProjectWorkspaceView {
  func activateLinkedFile(_ target: ProjectWorkspaceFileTarget) async {
    guard let context, context.isConsistent, context.session.gate(.sessionRead) == nil else {
      linkedNeedsRefresh = selectedFile != nil
      activeLease = nil
      fileController.deactivate()
      gitController.deactivate()
      return
    }

    if let previous = linkedEditorLease, !context.lease.hasSameEditorOwner(as: previous) {
      clearSelection()
      linkedSaveInFlight = nil
      linkedNeedsRefresh = false
    } else if linkedEditorLease != context.lease || linkedSocketOnline == false {
      linkedNeedsRefresh = selectedFile != nil
    }
    linkedEditorLease = context.lease
    activeLease = context.lease
    fileController.activate(context)
    gitController.activate(context)

    if selectedFile == nil {
      await openLinkedFile(target, lease: context.lease)
    } else if let path = selectedFile?.path, linkedNeedsRefresh,
      linkedSocketOnline == true || fileController.fileRead.value == nil
    {
      await refreshLinkedFile(path: path, lease: context.lease)
    }
  }

  private func openLinkedFile(_ target: ProjectWorkspaceFileTarget, lease: ProjectWorkspaceLease) async {
    var resolved = target
    if target.resolvesBareName {
      guard let path = try? await fileController.resolveBareFilename(target.path, lease: lease),
        !Task.isCancelled, activeLease == lease else { return }
      resolved = .init(path: path, line: target.line)
    }
    await perform(.openEditor(resolved))
  }

  private func refreshLinkedFile(path: String, lease: ProjectWorkspaceLease) async {
    await fileController.readFile(path: path)
    guard !Task.isCancelled, activeLease == lease, selectedFile?.path == path,
      fileController.fileRead.loadState == .loaded, let result = fileController.fileRead.value
    else { return }
    if editor.reconcileAfterReconnect(result, interruptedSave: linkedSaveInFlight) {
      linkedNeedsRefresh = false
      linkedSaveInFlight = nil
      if editor.requiresReload { presentedAlert = .reloadAfterSave }
    }
  }

  func saveSelectedFile() async {
    guard access.permitsWrite, let lease = context?.lease, activeLease == lease,
      fileController.fileRead.loadState == .loaded, fileController.fileRead.value?.status == .ready,
      fileController.fileRead.value?.path == editor.path, fileController.fileWrite.loadState != .loading
    else { return }
    if editor.requiresReload, editor.isDirty {
      presentedAlert = .reloadAfterSave
      return
    }
    guard let request = editor.saveRequest else { return }
    if showsLinkedFile { linkedSaveInFlight = request }
    let outcome = await fileController.writeFile(
      path: request.path, content: request.content,
      baseModifiedAtMs: request.modifiedAtMs, expectedLease: lease
    )
    guard activeLease == lease, selectedFile?.path == request.path, editor.owns(request) else { return }
    switch outcome {
    case .success(let saved):
      editor.markSaved(request, modifiedAtMs: saved.modifiedAtMs)
      linkedSaveInFlight = nil
    case .failure(let failure):
      if ProjectWorkspaceSaveRecovery.classify(failure) == .reloadRequired {
        presentedAlert = .reloadAfterSave
      }
    case nil:
      break
    }
  }

  func reloadSelectedFile() async {
    guard let path = selectedFile?.path else { return }
    await fileController.readFile(path: path)
    installSelectedRead(path: path)
  }

  func retrySelectedRead() async {
    if showsLinkedFile, linkedNeedsRefresh, let path = selectedFile?.path, let lease = activeLease {
      await refreshLinkedFile(path: path, lease: lease)
    } else if let linkedFile, linkedFile.resolvesBareName, selectedFile?.path == linkedFile.path,
      fileController.fileRead.value == nil, let lease = activeLease
    {
      await openLinkedFile(linkedFile, lease: lease)
    } else {
      await reloadSelectedFile()
    }
  }

  func entryMutated(_ mutation: ProjectWorkspaceEntryMutation) async {
    if let selectedPath = selectedFile?.path,
      selectedPath == mutation.affectedPath
        || selectedPath.hasPrefix(mutation.affectedPath + "/")
    {
      selectedFile = nil
      selectedLine = nil
      editor.clear()
    }
    if currentDirectory == mutation.affectedPath
      || currentDirectory.hasPrefix(mutation.affectedPath + "/")
    {
      currentDirectory = ProjectWorkspacePath.parent(of: mutation.affectedPath) ?? ""
    }
    await fileController.listTree(directoryPath: currentDirectory)
    await gitController.loadStatus(detail: .full)
  }

  func installSelectedRead(path: String) {
    guard selectedFile?.path == path,
      fileController.fileRead.loadState == .loaded,
      let value = fileController.fileRead.value,
      value.path == path
    else { return }
    _ = editor.install(value)
  }
}
