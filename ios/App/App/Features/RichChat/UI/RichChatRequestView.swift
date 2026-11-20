import SwiftUI

struct RichChatRequestsView: View {
  let requests: [RichOpenRequest]
  let controller: RichChatRequestController
  let canResolve: Bool
  let surface: RichChatRequestCardID.Surface

  var body: some View {
    if !requests.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(RichChatStrings.requests)
          .poracodeChatText(.body, weight: .semibold)
        ForEach(requests) { request in
          RichChatRequestCard(
            request: request,
            controller: controller,
            canResolve: canResolve,
            cardID: .init(requestID: request.id, surface: surface)
          )
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct RichChatRequestCard: View {
  let request: RichOpenRequest
  let controller: RichChatRequestController
  let canResolve: Bool
  let cardID: RichChatRequestCardID

  @State private var selected: Set<String> = []

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let form = RichChatRequestForm(request: request) {
        Text(form.message)
          .poracodeChatText(.body, weight: .semibold)
          .lineLimit(3)
        Button(SettingsUIStrings.edit) { controller.editForm(form, request: request) }
          .poracodeGlassButtonStyle()
          .disabled(!canResolve || !controller.canEditForm(request))
          .accessibilityIdentifier("native-e2e.request.form-edit")
      } else if RichChatRequestForm.recognizesPayload(request) {
        Text(request.payload.summary)
          .poracodeChatText(.body, weight: .semibold)
          .lineLimit(3)
        Text(RichChatStrings.failure(.invalidRequest))
          .poracodeChatText(.metadata)
      } else {
        approvalControls
      }
      if let failure = controller.state.failure {
        Text(RichChatStrings.failure(failure))
          .poracodeChatText(.metadata)
          .foregroundStyle(.red)
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .poracodeContentCardBackground()
    .accessibilityElement(children: .contain)
  }

  @ViewBuilder
  private var approvalControls: some View {
    ViewThatFits(in: .vertical) {
      requestContext.fixedSize(horizontal: false, vertical: true)
      scrollableContext
    }
    .frame(maxHeight: 128, alignment: .topLeading)
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
      .poracodeGlassButtonStyle()
      .disabled(!canResolve || selected.isEmpty || isResolving)
    } else {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) { optionButtons }
        VStack(alignment: .leading, spacing: 8) { optionButtons }
      }
    }
  }

  @ViewBuilder
  private var scrollableContext: some View {
    let content = ScrollView { requestContext }
      .accessibilityIdentifier("native-e2e.request.context")
    if #available(iOS 18.0, *) {
      content
        .defaultScrollAnchor(
          UnitPoint(x: 0.5, y: controller.readingProgress[cardID] ?? 0), for: .initialOffset
        )
        .onScrollGeometryChange(for: CGFloat?.self) { geometry in
          let insets = geometry.contentInsets
          let range = geometry.contentSize.height + insets.top + insets.bottom - geometry.containerSize.height
          guard range > 0 else { return nil }
          return min(1, max(0, (geometry.contentOffset.y + insets.top) / range))
        } action: { _, progress in
          if let progress { controller.readingProgress[cardID] = progress }
        }
    } else {
      content
    }
  }

  private var showsDetails: Binding<Bool> {
    Binding(
      get: { controller.expandedDetails.contains(cardID) },
      set: { expanded in
        if expanded { controller.expandedDetails.insert(cardID) }
        else { controller.expandedDetails.remove(cardID) }
      }
    )
  }

  private var requestContext: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(request.payload.summary)
        .poracodeChatText(.body, weight: .semibold)
        .textSelection(.enabled)
      if let details = request.payload.details {
        DisclosureGroup(
          RichChatStrings.showDetails,
          isExpanded: showsDetails
        ) {
          Text(detailsText(details))
            .poracodeChatText(.command)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        }
        .accessibilityIdentifier("native-e2e.request.details")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private var optionButtons: some View {
    ForEach(options, id: \.optionID) { option in
      if option.optionID == options.first?.optionID {
        Button(option.label) { resolve([option.optionID]) }
          .poracodeGlassButtonStyle()
          .disabled(!canResolve || isResolving)
          .accessibilityIdentifier("native-e2e.request.option.\(option.optionID)")
      } else {
        Button(option.label) { resolve([option.optionID]) }
          .poracodeSurfaceButtonStyle()
          .disabled(!canResolve || isResolving)
          .accessibilityIdentifier("native-e2e.request.option.\(option.optionID)")
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
        Text(description).poracodeChatText(.metadata).foregroundStyle(.secondary)
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
    guard
      let resolution = RichChatPresentation.requestResolution(
        request: request,
        optionIDs: optionIDs
      )
    else { return }
    Task { await controller.resolve(resolution, request: request) }
  }

  private func detailsText(_ value: RichJSON) -> String {
    guard let data = try? JSONEncoder().encode(value),
      let object = try? JSONSerialization.jsonObject(with: data),
      let rendered = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]),
      let text = String(data: rendered, encoding: .utf8)
    else { return "" }
    return String(text.prefix(2_000))
  }
}
