import SwiftUI

extension HomeQuickComposeView {
  var composerSurface: some View {
    HomeComposerSurface(isExpanded: isExpanded) {
      if isExpanded { expandedSurface } else { compactSurface }
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
    HomeComposerExpandedSurface {
      HStack(spacing: 8) {
        if launchSeed == nil {
          projectButton
        } else {
          fixedProjectLabel
        }
        Spacer(minLength: 8)
        presentationButton
      }

      if !skills.isEmpty || !attachments.isEmpty || !fileMentions.isEmpty
        || !mentionedMCPs.isEmpty
      {
        contextChips
      }

      if hasMentionSuggestions {
        mentionSuggestions
      }

      TextField(
        "",
        text: $prompt,
        prompt: Text(launchSeed?.promptPlaceholder ?? HomeStrings.quickComposePrompt)
          .foregroundStyle(Color.primary.opacity(0.5)),
        axis: .vertical
      )
      .lineLimit(4...7)
      .textFieldStyle(.plain)
      .foregroundStyle(.primary)
      .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
      .focused($promptFocused)
      .accessibilityIdentifier("native-e2e.new-thread-prompt")
      .onChange(of: prompt) { _, value in fileMentionController.update(draft: value) }

      worktreeButton

      if let failureMessage {
        Text(failureMessage)
          .font(.caption)
          .foregroundStyle(.red)
          .lineLimit(2)
      }

      actionBar
    }
  }

  var worktreeButton: some View {
    Button {
      selector = .add
    } label: {
      HStack(spacing: 7) {
        Label(worktreeSelection.label, systemImage: worktreeSelection.icon)
          .foregroundStyle(.primary)
        if worktreeSelection == .branch, let branch = currentBranch {
          Text(branch).foregroundStyle(.secondary).lineLimit(1)
        } else if worktreeSelection != .branch {
          Text(selectedWorktreeBranchLabel).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 4)
      }
      .font(.caption2)
    }
    .buttonStyle(.plain)
  }

  var actionBar: some View {
    HomeComposerActionBar {
      Button {
        collapseComposer()
      } label: {
        Image(systemName: "xmark")
      }
      .homeComposerCircleButton()
      .accessibilityLabel(HomeStrings.cancel)

      Button {
        selector = .add
      } label: {
        if importing {
          ProgressView().controlSize(.small)
        } else {
          Image(systemName: "plus")
        }
      }
      .homeComposerCircleButton()
      .accessibilityLabel(HomeStrings.add)

      modelButton

      if supportsFast { fastButton }
      if !effortOptions.isEmpty { effortMenu }
      permissionMenu

      Spacer(minLength: 0)

      reservedStartButton
    }
  }

  var projectButton: some View {
    Button {
      selector = .project
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
    if worktreeSelection == .worktree, let branch = branchSelection?.branch {
      return branch
    }
    return worktreeBranchName
  }

  var modelButton: some View {
    Button {
      selector = .model
    } label: {
      HStack(spacing: 5) {
        HomeProviderIcon(kind: selectedAgent?.kind ?? defaults?.agentKind ?? "")
          .frame(width: 14, height: 14)
          .foregroundStyle(.secondary)
        Text(modelLabel)
          .font(.caption)
          .foregroundStyle(.primary)
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.model)
  }

  var presentationButton: some View {
    Button {
      selector = .add
    } label: {
      Label(
        presentationMode == .gui ? HomeStrings.chat : HomeStrings.cli,
        systemImage: presentationMode == .gui ? "bubble.left" : "terminal"
      )
      .font(.caption)
      .foregroundStyle(.primary)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.mode)
  }

  var effortMenu: some View {
    Menu {
      ForEach(effortOptions, id: \.self) { effort in
        Button {
          selectedEffort = effort
        } label: {
          if effectiveConfiguration?.effort == effort {
            Label(effort.capitalized, systemImage: "checkmark")
          } else {
            Text(effort.capitalized)
          }
        }
      }
    } label: {
      Image(systemName: "chart.bar.fill")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .accessibilityLabel(HomeStrings.effort)
  }

  var fastButton: some View {
    Button {
      fast.toggle()
    } label: {
      Image(systemName: fast ? "bolt.fill" : "bolt")
        .font(.caption)
        .foregroundStyle(fast ? Color.yellow : Color.secondary)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(HomeStrings.fast)
  }

  var permissionMenu: some View {
    Menu {
      ForEach(
        HomeComposerPermission.allCases.filter {
          $0 != .configured || configuredConfiguration != nil
        }
      ) { option in
        Button {
          permissionMode = option
        } label: {
          if permissionMode == option {
            Label(option.label, systemImage: "checkmark")
          } else {
            Text(option.label)
          }
        }
      }
    } label: {
      Image(systemName: permissionMode == .auto ? "shield" : "shield.slash")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .accessibilityLabel(HomeStrings.permissions)
  }

  var startButton: some View {
    HomeComposerStartButton(
      canStart: canStart,
      isBusy: lifecycle.isBusy || preparingWorktree,
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
