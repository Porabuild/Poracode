import Foundation

/// Operation identity is ephemeral UI metadata, never inferred from a model
/// name or serialized as part of a config. Only a proven member edit can mint.
enum ModelSelectionMutation {
  case familyMember(ModelFamilySelection)
  case exactModel, ownerRetarget, unrelated
  case independentCarriers(Set<ModelSelectionAxis>)
  case nativeAcknowledgement(Set<ModelSelectionAxis>)
}

enum ModelSelectionBindings {
  /// The complete-config seam corresponding to applyThreadConfigMutation in
  /// shared TS. A family refusal leaves the caller's entire selection intact.
  /// Other operations discard any record injected into the proposed config.
  static func applying(
    _ event: ModelSelectionMutation, previous: ThreadConfig, next: ThreadConfig,
    owner: ModelSelectionOwner?
  ) -> ThreadConfig? {
    var result = next
    result.selectionBinding = nil
    switch event {
    case .exactModel, .ownerRetarget:
      return result
    case .familyMember(let relation):
      guard let owner, owner.isValid, ModelFamilies.isValid(relation),
        relation.members.contains(where: { $0.model == result.model }) else { return nil }
      var values: [ModelSelectionAxis: JSONValue] = [:]
      for axis in ModelSelectionAxis.allCases {
        if let present = axis.value(in: result), relation.redundantValues?.values[axis]?.contains(present) == true {
          values[axis] = present
        }
      }
      result.selectionBinding = ModelSelectionBinding(owner: owner, model: result.model, inertValues: values)
      return result
    case .unrelated, .independentCarriers, .nativeAcknowledgement:
      guard let owner, let previousBinding = previous.selectionBinding,
        previousBinding.matches(previous, owner: owner) else { return result }
      var values = previousBinding.inertValues
      switch event {
      case .independentCarriers(let axes), .nativeAcknowledgement(let axes):
        for axis in axes { values.removeValue(forKey: axis) }
      default: break
      }
      if let retained = ModelSelectionBinding(owner: previousBinding.owner, model: previousBinding.model, inertValues: values),
        retained.matches(result, owner: owner) { result.selectionBinding = retained }
      return result
    }
  }

  /// Restore/refresh/send never mint, reduce or reinterpret a selection.
  /// They may retain only an already matching record for the actual owner.
  static func validated(_ configuration: ThreadConfig, owner: ModelSelectionOwner?) -> ThreadConfig {
    applying(.unrelated, previous: configuration, next: configuration, owner: owner) ?? configuration
  }
}
