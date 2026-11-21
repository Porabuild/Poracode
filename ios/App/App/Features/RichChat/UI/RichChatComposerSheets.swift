import SwiftUI

extension RichChatComposerView {
  func openKeyboardModelPicker() {
    restorePromptAfterControls = true
    if ThreadCrewBinding(wire: configuration.crew) != nil { openCrewEditor() }
    else { controlsPresented = .models }
  }

  @ViewBuilder var composerSkillsSheet: some View {
    if let skillPickerContext {
      RichChatComposerSkillPicker(context: skillPickerContext, selection: $skills)
        .nativeCommands(identity: "composer-skills", blocksParentActions: true)
        .poracodeFormSheetSizing()
    }
  }

  @ViewBuilder func composerControlsSheet(_ presentation: RichChatComposerControlsPresentation) -> some View {
    Group {
      if presentation == .crew {
        crewRosterSheet.poracodeFormSheetSizing()
      } else if presentation == .models {
        NativeComposerModelPicker(configuration: $configuration, catalog: slashCommandCatalog,
          hasStartedSession: hasStartedSession, canConfigure: canConfigure && canOperate).poracodeFormSheetSizing()
      } else {
        RichChatComposerControlsSheet(
          configuration: $configuration, agentStatus: agentStatus, presentationMode: .gui,
          sessionConfigOptions: sessionConfigOptions, hiddenModels: hiddenModels,
          hasStartedSession: hasStartedSession, bindingsReadOnly: true, agentInstanceID: agentInstanceID
        )
        .poracodeFormSheetSizing()
      }
    }
    .nativeCommands(identity: "composer-controls:\(presentation.id)", blocksParentActions: true)
  }
}
