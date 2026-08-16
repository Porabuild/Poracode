import SwiftUI

struct RichChatRequestsView: View {
  let requests: [RichOpenRequest]
  let controller: RichChatRequestController
  let canResolve: Bool

  var body: some View {
    if !requests.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(RichChatStrings.requests)
          .font(.headline)
        ForEach(requests) { request in
          RichChatRequestCard(
            request: request,
            controller: controller,
            canResolve: canResolve
          )
        }
      }
    }
  }
}

private struct RichChatRequestCard: View {
  let request: RichOpenRequest
  let controller: RichChatRequestController
  let canResolve: Bool

  @State private var showsDetails = false
  @State private var selected: Set<String> = []

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(request.payload.summary)
        .font(.subheadline.weight(.semibold))
      if let details = request.payload.details {
        DisclosureGroup(
          RichChatStrings.showDetails,
          isExpanded: $showsDetails
        ) {
          Text(detailsText(details))
            .font(.caption.monospaced())
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        }
      }
      if request.payload.multiSelect == true {
        ForEach(options, id: \.optionID) { option in
          Toggle(isOn: selectionBinding(for: option.optionID)) {
            optionLabel(option)
          }
          .toggleStyle(.button)
          .disabled(!canResolve)
        }
        Button(RichChatStrings.value("rich_chat_submit", "Submit")) {
          resolve(Array(selected))
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canResolve || selected.isEmpty || isResolving)
      } else {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 8) { optionButtons }
          VStack(alignment: .leading, spacing: 8) { optionButtons }
        }
      }
      if let failure = controller.state.failure {
        Text(RichChatStrings.failure(failure))
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
    .padding(12)
    .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
  }

  @ViewBuilder
  private var optionButtons: some View {
    ForEach(options, id: \.optionID) { option in
      if option.optionID == options.first?.optionID {
        Button(option.label) { resolve([option.optionID]) }
          .buttonStyle(.borderedProminent)
          .disabled(!canResolve || isResolving)
      } else {
        Button(option.label) { resolve([option.optionID]) }
          .buttonStyle(.bordered)
          .disabled(!canResolve || isResolving)
      }
    }
  }

  private var options: [RichRequestOption] {
    request.payload.options ?? [
      RichRequestOption(optionID: "allow", label: RichChatStrings.allow, description: nil),
      RichRequestOption(optionID: "deny", label: RichChatStrings.deny, description: nil),
    ]
  }

  private var isResolving: Bool {
    controller.state.resolvingRequestID != nil
  }

  private func optionLabel(_ option: RichRequestOption) -> some View {
    VStack(alignment: .leading) {
      Text(option.label)
      if let description = option.description {
        Text(description).font(.caption).foregroundStyle(.secondary)
      }
    }
  }

  private func selectionBinding(for optionID: String) -> Binding<Bool> {
    Binding(
      get: { selected.contains(optionID) },
      set: { enabled in
        if enabled { selected.insert(optionID) } else { selected.remove(optionID) }
      }
    )
  }

  private func resolve(_ optionIDs: [String]) {
    guard let resolution = RichChatPresentation.requestResolution(
      request: request,
      optionIDs: optionIDs
    ) else { return }
    Task { await controller.resolve(resolution, request: request) }
  }

  private func detailsText(_ value: RichJSON) -> String {
    guard let data = try? JSONEncoder().encode(value),
      let object = try? JSONSerialization.jsonObject(with: data),
      let rendered = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted]),
      let text = String(data: rendered, encoding: .utf8)
    else { return "" }
    return String(text.prefix(2_000))
  }
}
