import SwiftUI

/// Reusable contextual controls for a later hook in the existing Git change pane.
struct GitOperationsFileActions: View {
  let location: ProjectLocation
  let change: ProjectGitFileChange
  let isBusy: Bool
  let submit: (GitOperationRequest) -> Void

  var body: some View {
    ControlGroup {
      ForEach(applicableActions) { descriptor in
        action(descriptor.procedure) {
          submit(request(for: descriptor.procedure))
        }
      }
    }
    .disabled(isBusy)
    .accessibilityElement(children: .contain)
  }

  private var applicableActions: [GitOperationsActionDescriptor] {
    GitOperationsPresentation.actions(on: .file).filter { descriptor in
      switch descriptor.procedure {
      case .gitUnstage: change.staged
      case .gitStage, .gitRevert: !change.staged
      default: false
      }
    }
  }

  private func request(for procedure: GitOperationProcedure) -> GitOperationRequest {
    switch procedure {
    case .gitStage:
      .gitStage(.init(projectLocation: location, filePath: change.path))
    case .gitUnstage:
      .gitUnstage(.init(projectLocation: location, filePath: change.path))
    case .gitRevert:
      .gitRevert(.init(projectLocation: location, filePath: change.path))
    default:
      preconditionFailure("Unsupported file Git operation")
    }
  }

  private func action(
    _ procedure: GitOperationProcedure,
    handler: @escaping () -> Void
  ) -> some View {
    let descriptor = GitOperationsPresentation.descriptor(for: procedure)
    return Button(action: handler) {
      Label(descriptor.accessibilityLabel, systemImage: descriptor.symbol)
    }
    .accessibilityLabel(descriptor.accessibilityLabel)
  }
}
