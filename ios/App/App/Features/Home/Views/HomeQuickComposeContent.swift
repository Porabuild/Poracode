import SwiftUI

extension HomeQuickComposeView {
  var composerSurface: some View {
    VStack(spacing: 6) {
    HomeComposerSurface(isExpanded: isExpanded) {
      if isExpanded { expandedSurface } else { compactSurface }
    }
      if newsPlacement == .composer, showsNews, !isCompactHeight || !draft.promptFocused {
        newsLine
      }
    }
  }

  var compactSurface: some View {
    HomeComposerCompactSurface(
      prompt: hasSendableContent ? compactPrompt : HomeStrings.quickComposePrompt,
      hasContent: hasSendableContent,
      isEnabled: !projects.isEmpty && session.canOperate,
      expand: {
        guard !projects.isEmpty, session.canOperate else { return }
        withAnimation(.snappy(duration: 0.25)) { isExpanded = true }
      },
      trailing: {
        if hasSendableContent {
          startButton
            .transition(.scale.combined(with: .opacity))
        }
      }
    )
  }

  var expandedSurface: some View {
    HomeComposerExpandedSurface(isCompactHeight: isCompactHeight, showsHeader: showsContextHeader) {
      HStack(spacing: 8) {
        if launchSeed == nil {
          projectButton
        } else {
          fixedProjectLabel
        }
        Spacer(minLength: 8)
        closeComposerButton
        // Presentation (Chat/CLI) lives in the + sheet's Mode section with
        // the other launch options, as on desktop — no separate header chip.
      }
    } content: {
      if !draft.skills.isEmpty || !draft.attachments.isEmpty || !draft.fileMentions.isEmpty
        || !draft.mentionedMCPs.isEmpty
        || !draft.additionalSegments.isEmpty
      {
        contextChips
      }

      if hasMentionSuggestions {
        mentionSuggestions
      }

      if let reference = RichChatSkillReference.atCaret(in: draft.prompt, selection: draft.promptSelection) {
        let catalog = RichChatComposerControlCatalog(
          agentStatus: selectedAgent,
          presentationMode: draft.presentationMode,
          configuration: ThreadConfig(model: draft.selectedModel ?? "")
        )
        VStack(spacing: 0) {
          ForEach(Array(catalog.slashSuggestions(for: draft.prompt, selection: draft.promptSelection).prefix(6))) { command in
            Button {
              guard let skill = command.skill else { return }
              if !draft.skills.contains(where: { $0.id == skill.id }) { draft.skills.append(skill) }
              draft.prompt = reference.removingToken(from: draft.prompt)
              draft.promptSelection = NSRange(location: reference.range.location, length: 0)
              draft.promptFocused = true
            } label: {
              Label(command.displayID, systemImage: "wand.and.stars")
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.plain)
          }
        }
      }

      RichChatComposerTextInput(
        text: $draft.prompt,
        selection: $draft.promptSelection,
        focused: $draft.promptFocused,
        lineLimit: isCompactHeight ? 1...2 : 1...5,
        placeholder: launchSeed?.promptPlaceholder ?? HomeStrings.quickComposePrompt,
        keyboardOwnerID: presentationID
      )
      .foregroundStyle(.primary)
      .frame(
        maxWidth: .infinity,
        minHeight: 34,
        alignment: .topLeading
      )
      .accessibilityIdentifier("native-e2e.new-thread-prompt")
      .onChange(of: draft.prompt) { _, value in draft.fileMentionController.update(draft: value) }

      if draft.worktreeSelection != .branch { worktreeButton }

      if let failure = draft.failureMessage {
        Text(failure)
          .font(.caption)
          .foregroundStyle(.red)
          .lineLimit(2)
      }
      if case .failed(let failure) = draft.tools.document.state {
        SettingsUnavailableView(failure: failure) {
          Task { await loadComposerTools() }
        }
      }

    } controls: {
      actionBar
    }
  }

  var worktreeButton: some View {
    Button {
      draft.selector = .add
    } label: {
      HStack(spacing: 7) {
        Label(draft.worktreeSelection.label, systemImage: draft.worktreeSelection.icon)
          .foregroundStyle(.primary)
        if draft.worktreeSelection == .branch, let branch = currentBranch {
          Text(branch).foregroundStyle(.secondary).lineLimit(1)
        } else if draft.worktreeSelection != .branch {
          Text(selectedWorktreeBranchLabel).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 4)
      }
      .font(.caption2)
    }
    .buttonStyle(.plain)
  }

  var actionBar: some View {
    PoracodeComposerControls {
      Button {
        draft.selector = .add
      } label: {
        Group {
          if draft.importing {
            ProgressView().controlSize(.small)
          } else {
            Image(systemName: "plus")
          }
        }
        .homeComposerCircleButton()
      }
      .buttonStyle(.plain)
      .accessibilityLabel(HomeStrings.add)
      .accessibilityIdentifier("native-e2e.new-thread-add")

    } configuration: {
      homeCrewAwareSelectors
    } voice: {
      ComposerVoiceButton(owner: session.currentRichChatAccess.map {
        .init(lease: $0.lease, conversationID: draft.threadID)
      }, text: $draft.prompt, selection: $draft.promptSelection,
        isEnabled: session.canOperate && !draft.lifecycle.isBusy, visualSize: 38,
        prepareToRecord: { draft.promptFocused = false }, keyboardOwnerID: presentationID, stateOwnerID: ObjectIdentifier(draft))
    } trailing: {
      reservedStartButton
    }
  }

  private var closeComposerButton: some View {
    Button { collapseComposer() } label: {
      Image(systemName: "xmark.circle.fill")
        .symbolRenderingMode(.hierarchical)
        .font(.title2)
        .foregroundStyle(.secondary)
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.cancel)
    .accessibilityIdentifier("native-e2e.new-thread-close")
  }

  var projectButton: some View {
    Button {
      draft.selector = .project
    } label: {
      HStack(spacing: 6) {
        HomeServerStatusIcon(online: session.socketState == .online)
        Text(selectedProject?.name ?? HomeStrings.project)
          .font(.caption.weight(.medium))
          .lineLimit(1)
        Text(selectedHostLabel)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.project)
  }

  var fixedProjectLabel: some View {
    HStack(spacing: 6) {
      HomeServerStatusIcon(online: session.socketState == .online)
      Text(selectedProject?.name ?? HomeStrings.project)
        .font(.caption.weight(.medium))
        .lineLimit(1)
      Text(selectedHostLabel)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .accessibilityElement(children: .combine)
  }

  var selectedWorktreeBranchLabel: String {
    if draft.worktreeSelection == .worktree, let branch = draft.branchSelection?.branch {
      return branch
    }
    return draft.worktreeBranchName
  }

  var startButton: some View {
    HomeComposerStartButton(
      canStart: canStart && !savedCrewRestorePending,
      isBusy: draft.lifecycle.isBusy || draft.preparingWorktree,
      start: start
    )
  }

  var reservedStartButton: some View {
    startButton
      .opacity(hasSendableContent ? 1 : 0)
      .allowsHitTesting(hasSendableContent)
      .accessibilityHidden(!hasSendableContent)
  }
}
