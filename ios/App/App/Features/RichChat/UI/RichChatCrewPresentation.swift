import Foundation
import SwiftUI

struct RichChatCrewRole: Equatable, Identifiable, Sendable {
  let id: String
  let label: String
  let agentKind: String
  let model: String
  let effort: String?
  let fast: Bool
  let noEdits: Bool
  let parallel: Int
}

struct RichChatCrewPresentation: Equatable, Sendable {
  let name: String
  let policy: String
  let roles: [RichChatCrewRole]

  var helperCount: Int { roles.reduce(0) { $0 + $1.parallel } }

  init?(opaqueValue: JSONValue?) {
    guard let crew = opaqueValue?.objectValue,
      case .array(let rawRoles)? = crew["roles"]
    else { return nil }
    name = crew["name"]?.stringValue ?? ""
    policy = crew["policy"]?.stringValue ?? "crew-only"
    roles = rawRoles.compactMap { value in
      guard let role = value.objectValue,
        let id = role["id"]?.stringValue,
        let label = role["label"]?.stringValue,
        let selection = role["selection"]?.objectValue,
        let agentKind = selection["agentKind"]?.stringValue,
        let model = selection["model"]?.stringValue
      else { return nil }
      return RichChatCrewRole(
        id: id,
        label: label,
        agentKind: agentKind,
        model: model,
        effort: selection["effort"]?.stringValue,
        fast: selection["fast"]?.boolValue ?? false,
        noEdits: role["noEdits"]?.boolValue ?? false,
        parallel: max(1, role["parallel"]?.numberInt ?? 1)
      )
    }
  }
}

struct RichChatCrewRosterSheet: View {
  let crew: RichChatCrewPresentation
  let leadAgentKind: String
  let leadModel: String
  let leadEffort: String?
  let leadFast: Bool

  var body: some View {
    NavigationStack {
      List {
        Section {
          member(
            label: RichChatStrings.crewLead,
            agentKind: leadAgentKind,
            model: leadModel,
            effort: leadEffort,
            fast: leadFast,
            noEdits: false
          )
        }
        if !crew.roles.isEmpty {
          Section {
            ForEach(crew.roles) { role in
              member(
                label: role.label,
                agentKind: role.agentKind,
                model: role.model,
                effort: role.effort,
                fast: role.fast,
                noEdits: role.noEdits,
                parallel: role.parallel
              )
            }
          }
        }
      }
      .poracodeDrawerListStyle()
      .navigationTitle(crew.name.isEmpty ? RichChatStrings.crew : crew.name)
      .navigationBarTitleDisplayMode(.inline)
      .safeAreaInset(edge: .bottom) {
        Text(crew.policy == "crew-first" ? RichChatStrings.crewFirst : RichChatStrings.crewOnly)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20)
          .padding(.vertical, 12)
      }
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button(RichChatStrings.done) { dismiss() }
        }
      }
    }
  }

  @Environment(\.dismiss) private var dismiss

  @ViewBuilder
  private func member(
    label: String,
    agentKind: String,
    model: String,
    effort: String?,
    fast: Bool,
    noEdits: Bool,
    parallel: Int = 1
  ) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        Text(label).font(.subheadline.weight(.semibold))
        if parallel > 1 {
          Text("×\(parallel)").foregroundStyle(.secondary)
        }
        Spacer(minLength: 4)
        if fast {
          Text(RichChatStrings.fastMode).font(.caption).foregroundStyle(.secondary)
        }
        if noEdits {
          Image(systemName: "pencil.slash")
            .foregroundStyle(.secondary)
            .accessibilityLabel(RichChatStrings.crewNoEdits)
        }
      }
      Text(([agentKind, model] + [effort].compactMap { $0 }).joined(separator: " · "))
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

extension RichChatComposerView {
  var crewPresentation: RichChatCrewPresentation? {
    RichChatCrewPresentation(opaqueValue: configuration.crew)
  }

  /// The crew roster sheet; empty when the binding cannot be presented.
  @ViewBuilder
  var crewRosterSheet: some View {
    if let crewPresentation {
      RichChatCrewRosterSheet(
        crew: crewPresentation,
        leadAgentKind: agentKind,
        leadModel: configuration.model,
        leadEffort: configuration.effort,
        leadFast: configuration.fast == true
      )
    }
  }
}
