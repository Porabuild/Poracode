import SwiftUI

struct RichChatRequestFormPresentation: ViewModifier {
  let suite: RichChatControllerSuite
  let canResolve: Bool
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @State private var browserVisit: RichChatExternalRequestVisit?

  func body(content: Content) -> some View {
    content
      .onChange(of: suite.transcript.state.transcript?.openRequests, initial: true) { _, requests in
        if let requests { suite.requests.reconcileRequestForms(with: requests) }
      }
      .onChange(of: requestsAfterBrowserVisit, initial: true) { _, requests in
        guard let requests, let visit = browserVisit else { return }
        browserVisit = nil
        if let request = visit.matchingRequest(in: requests) {
          suite.requests.editForm(visit.form, request: request)
        }
      }
      .sheet(item: Bindable(suite.requests).editingForm) { draft in
        RichChatRequestFormSheet(
          draft: draft, controller: suite.requests, canResolve: canResolve,
          openRequiredPage: { url in visitPage(url, draft: draft) },
          close: {
            browserVisit = nil
            if suite.requests.editingForm === draft { suite.requests.editingForm = nil }
          }
        )
      }
      .modifier(PoracodeRetainNavigationWhilePresented(isPresented: suite.requests.editingForm != nil))
  }

  private var requestsAfterBrowserVisit: [RichOpenRequest]? {
    guard scenePhase == .active, !suite.scope.isBackgrounded, let visit = browserVisit,
      let target = suite.requests.state.target, visit.needsRebind(to: target),
      suite.transcript.state.target == target, !suite.transcript.state.requiresAuthoritativeRefresh,
      [.loaded, .empty].contains(suite.transcript.state.loadState)
    else { return nil }
    return suite.transcript.state.transcript?.openRequests ?? []
  }

  private func visitPage(_ url: URL, draft: RichChatRequestFormDraft) {
    guard suite.requests.editingForm === draft, let target = suite.requests.state.target else { return }
    let visit = RichChatExternalRequestVisit(target: target, requestID: draft.id, form: draft.form)
    browserVisit = visit
    openURL(url) { accepted in
      if !accepted && browserVisit == visit { browserVisit = nil }
    }
  }
}

struct RichChatRequestFormSheet: View {
  let draft: RichChatRequestFormDraft
  let controller: RichChatRequestController
  let canResolve: Bool
  let openRequiredPage: (URL) -> Void
  let close: () -> Void
  @State private var keyboardVisible = false
  @FocusState private var focusedField: String?

  private var isResolving: Bool { controller.state.resolvingRequestID != nil }
  private var blocked: Bool {
    !canResolve || isResolving || controller.state.requiresAuthoritativeRefresh
      || draft.submitted
  }

  var body: some View {
    NavigationStack {
      ScrollViewReader { scroll in
        form
          .onGeometryChange(for: CGSize.self) { $0.size } action: { _ in revealField(in: scroll) }
          .onChange(of: keyboardVisible) { revealField(in: scroll) }
          .onChange(of: focusedField) { revealField(in: scroll) }
      }
      .poracodeComposerInset {
        if keyboardVisible {
          HStack {
            closeButton.poracodeGlassButtonStyle()
            Spacer()
            if !draft.form.requiresExternalVisit {
              submitButton.poracodeGlassButtonStyle()
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
        }
      }
      .navigationTitle(RichChatStrings.requests)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if !keyboardVisible {
          ToolbarItem(placement: .cancellationAction) { closeButton }
          if !draft.form.requiresExternalVisit {
            ToolbarItem(placement: .confirmationAction) {
              submitButton
            }
          }
        }
      }
      .poracodeAvoidKeyboard { availableHeight in keyboardVisible = availableHeight > 0 }
      .ignoresSafeArea(.keyboard, edges: .bottom)
    }
    .interactiveDismissDisabled(isResolving)
    .modifier(PoracodeRetainNavigationWhilePresented())
  }

  private var form: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 8) {
          if let source = draft.form.source {
            Text(source).font(.caption).foregroundStyle(.secondary)
          }
          Text(draft.form.message)
          ForEach(draft.form.links) { link in
            if draft.form.requiresExternalVisit {
              Button { openRequiredPage(link.url) } label: {
                Label(link.title, systemImage: "arrow.up.right")
              }
              .accessibilityAddTraits(.isLink)
              .disabled(isResolving)
              .accessibilityIdentifier("native-e2e.request.form-link")
            } else {
              Link(destination: link.url) {
                Label(link.title, systemImage: "arrow.up.right")
              }
            }
            if let description = link.description {
              Text(description).font(.caption).foregroundStyle(.secondary)
            }
          }
        }
        ForEach(draft.form.fields.filter { $0.isVisible(draft.values) }) { field in
          RichChatRequestFormFieldSection(field: field, draft: draft, focus: $focusedField)
            .disabled(blocked)
            .id(field.id)
        }
        Button(draft.form.isQuestion ? RichChatStrings.cancel : RichChatStrings.decline, role: .destructive) {
          resolve(draft.form.cancelResponse)
        }
        .poracodeSurfaceButtonStyle(tint: .red)
        .disabled(blocked)
        .accessibilityIdentifier("native-e2e.request.form-decline")
        if let failure = controller.state.failure {
          Text(RichChatStrings.failure(failure)).foregroundStyle(.secondary)
        }
      }
      .padding(16)
      .frame(maxWidth: 680)
      .frame(maxWidth: .infinity, alignment: .center)
    }
  }

  private func revealField(in scroll: ScrollViewProxy) {
    if keyboardVisible, let focusedField { scroll.scrollTo(focusedField, anchor: .center) }
  }

  private var closeButton: some View {
    Button(AdvancedOperationsStrings.close, systemImage: "xmark", action: close)
      .disabled(isResolving)
  }

  private var submitButton: some View {
    Button(RichChatStrings.value("rich_chat_submit", "Submit"), systemImage: "checkmark") {
      if let response = draft.response { resolve(response) }
    }
    .disabled(blocked || draft.response == nil)
    .accessibilityIdentifier("native-e2e.request.form-submit")
  }

  private func resolve(_ response: RichJSON) {
    Task {
      guard !blocked else { return }
      if await controller.resolveForm(draft, response: response) {
        close()
      }
    }
  }
}

private struct RichChatRequestFormFieldSection: View {
  let field: RichChatRequestFormField
  let draft: RichChatRequestFormDraft
  let focus: FocusState<String?>.Binding

  private var value: RichJSON? { draft.values[field.id] }
  private var additionalValues: [String] {
    (value?.arrayValue ?? []).compactMap(\.stringValue).filter { entry in
      !field.options.contains { $0.id == entry }
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(field.title).font(.subheadline.weight(.semibold))
      VStack(alignment: .leading, spacing: 8) {
        if let description = field.description {
          Text(description).foregroundStyle(.secondary)
        }
        editor
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(12)
      .poracodeContentCardBackground()
    }
  }

  @ViewBuilder
  private var editor: some View {
    switch field.kind {
    case .boolean:
      Toggle(field.title, isOn: Binding(
        get: { value?.boolValue ?? false },
        set: { draft.values[field.id] = .bool($0) }
      ))
      .poracodeSwitchStyle()
      .accessibilityIdentifier("native-e2e.request.field.\(field.id)")
    case .integer, .number:
      TextField(field.placeholder ?? field.title, text: Binding(
        get: {
          draft.numericText[field.id] ?? value?.decimalValue.map {
            NSDecimalNumber(decimal: $0).description(withLocale: Locale.current)
          } ?? ""
        },
        set: { draft.editNumber($0, in: field) }
      ))
      .keyboardType(.numbersAndPunctuation)
      .padding(8)
      .poracodeInputSurface()
      .focused(focus, equals: field.id)
      .accessibilityIdentifier("native-e2e.request.field.\(field.id)")
    case .array:
      options
      if field.allowsCustom {
        if field.isQuestion { customEntry }
        else { listEntry }
      }
    case .string:
      if field.options.isEmpty {
        textEntry(label: field.placeholder ?? field.title, text: Binding(
          get: { value?.stringValue ?? "" },
          set: { draft.values[field.id] = .string($0) }
        ))
      } else {
        options
        if field.allowsCustom { customEntry }
      }
    }
  }

  private var options: some View {
    ForEach(field.options) { option in
      let selected = value == .string(option.id) || value?.arrayValue?.contains(.string(option.id)) == true
      Button {
        if field.isQuestion { draft.custom.removeValue(forKey: field.id) }
        draft.choose(option.id, in: field)
      } label: {
        HStack {
          VStack(alignment: .leading, spacing: 3) {
            Text(option.label)
            if let description = option.description {
              Text(description).font(.caption).foregroundStyle(.secondary)
            }
          }
          Spacer()
          if selected { Image(systemName: "checkmark").accessibilityHidden(true) }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityAddTraits(selected ? .isSelected : [])
      .accessibilityIdentifier("native-e2e.request.field.\(field.id).option.\(option.id)")
    }
  }

  private var customEntry: some View {
    textEntry(label: field.placeholder ?? RichChatStrings.value("rich_chat_background_task_other", "Other"), text: Binding(
      get: {
        if let custom = draft.custom[field.id] { return custom }
        return value?.stringValue.flatMap { text in field.options.contains { $0.id == text } ? nil : text } ?? ""
      },
      set: { draft.editCustom($0, in: field) }
    ))
  }

  @ViewBuilder
  private var listEntry: some View {
    ForEach(Array(additionalValues.enumerated()), id: \.offset) { _, entry in
      HStack {
        Text(entry)
        Spacer()
        Button {
          var current = value?.arrayValue ?? []
          if let index = current.firstIndex(of: .string(entry)) {
            current.remove(at: index)
            draft.values[field.id] = .array(current)
          }
        } label: {
          Image(systemName: "minus.circle")
        }
        .accessibilityLabel(AdvancedOperationsStrings.removeSegment)
        .buttonStyle(.borderless)
      }
    }
    let pending = (draft.additionalItem[field.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    HStack {
      TextField(field.placeholder ?? field.title, text: Binding(
        get: { draft.additionalItem[field.id] ?? "" },
        set: { draft.additionalItem[field.id] = $0 }
      ))
      .focused(focus, equals: field.id)
      .padding(8)
      .poracodeInputSurface()
      .accessibilityIdentifier("native-e2e.request.field.\(field.id)")
      Button(HomeStrings.add) {
        let current = value?.arrayValue ?? []
        draft.values[field.id] = .array(current + [.string(pending)])
        draft.additionalItem[field.id] = ""
      }
      .buttonStyle(.borderless)
      .disabled(pending.isEmpty || value?.arrayValue?.contains(.string(pending)) == true)
    }
  }

  @ViewBuilder
  private func textEntry(label: String, text: Binding<String>) -> some View {
    Group {
      if field.secret {
        SecureField(label, text: text)
          .focused(focus, equals: field.id)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      } else if field.isQuestion {
        TextField(label, text: text, axis: .vertical)
          .focused(focus, equals: field.id)
          .lineLimit(2...6)
      } else {
        TextField(label, text: text)
          .focused(focus, equals: field.id)
      }
    }
    .padding(8)
    .poracodeInputSurface()
    .accessibilityIdentifier("native-e2e.request.field.\(field.id)")
  }
}
