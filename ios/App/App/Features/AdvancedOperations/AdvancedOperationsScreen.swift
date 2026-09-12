import SwiftUI

extension AdvancedOperationProcedure: Identifiable {
  var id: String { rawValue }
}

/// Adaptive Advanced Operations surface.
///
/// One implementation serves iPhone and iPad: the available width selects a
/// stacked or side-by-side presentation, so no platform-only size-class API is
/// required.
struct AdvancedOperationsScreen: View {
  let composition: AdvancedOperationsComposition

  @State private var model: AdvancedOperationsScreenModel
  @State private var presented: AdvancedOperationProcedure?
  @Environment(\.scenePhase) private var scenePhase

  init(composition: AdvancedOperationsComposition) {
    self.composition = composition
    _model = State(initialValue: AdvancedOperationsScreenModel(composition: composition))
  }

  var body: some View {
    GeometryReader { proxy in
      let layout = AdvancedOperationsLayout(width: proxy.size.width)
      Group {
        if layout.showsSideBySideOutcome {
          HStack(alignment: .top, spacing: 20) {
            catalog(layout)
            outcomeColumn.frame(maxWidth: proxy.size.width * 0.42)
          }
        } else {
          catalog(layout)
        }
      }
      .padding(20)
    }
    .navigationTitle(AdvancedOperationsStrings.title)
    .task(id: AdvancedOperationsActivationID(composition)) { model.invalidate() }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { model.leaveBackground() } else { model.enterBackground() }
    }
    .sheet(item: $presented) { procedure in
      AdvancedOperationFormView(
        descriptor: AdvancedOperationsPresentation.descriptor(for: procedure),
        owner: model.access(for: procedure)?.lease.owner,
        submit: { draft in await model.submit(draft) }
      )
    }
    .confirmationDialog(
      model.pendingMutation?.title ?? AdvancedOperationsStrings.confirm,
      isPresented: confirmationBinding,
      titleVisibility: .visible,
      presenting: model.pendingMutation
    ) { pending in
      Button(pending.confirmTitle, role: .destructive) {
        Task { _ = await model.confirmPendingMutation() }
      }
      Button(AdvancedOperationsStrings.cancel, role: .cancel) { model.cancelPendingMutation() }
    } message: { pending in
      Text(pending.message)
    }
  }

  private var confirmationBinding: Binding<Bool> {
    Binding(
      get: { model.pendingMutation != nil },
      set: { if !$0 { model.cancelPendingMutation() } }
    )
  }

  private func catalog(_ layout: AdvancedOperationsLayout) -> some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 20) {
        header
        ForEach(AdvancedOperationCategory.allCases) { category in
          AdvancedOperationsChrome.card {
            VStack(alignment: .leading, spacing: 12) {
              Text(AdvancedOperationsStrings.category(category))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
              grid(category, layout: layout)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        if !layout.showsSideBySideOutcome {
          outcomeColumn
        }
      }
    }
  }

  @ViewBuilder
  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(AdvancedOperationsStrings.subtitle)
        .font(.subheadline)
        .foregroundStyle(.secondary)
      if model.requiresAuthoritativeRefresh {
        AdvancedOperationNoticeView(
          message: AdvancedOperationsStrings.refreshRequired,
          actionTitle: AdvancedOperationsStrings.refreshAcknowledge,
          action: { model.acknowledgeAuthoritativeRefresh() }
        )
      }
      if let failure = model.failure {
        AdvancedOperationNoticeView(
          message: AdvancedOperationsStrings.failure(failure),
          actionTitle: AdvancedOperationsStrings.dismiss,
          action: { model.clearFailure() }
        )
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func grid(
    _ category: AdvancedOperationCategory,
    layout: AdvancedOperationsLayout
  ) -> some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: layout.columnMinimum), spacing: 12)],
      spacing: 12
    ) {
      ForEach(AdvancedOperationsPresentation.descriptors(in: category)) { descriptor in
        AdvancedOperationsChrome.actionButton(role: descriptor.role) {
          presented = descriptor.procedure
        } label: {
          Label(descriptor.title, systemImage: descriptor.symbol)
            .frame(maxWidth: .infinity, minHeight: 44)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
        }
        .disabled(!model.permits(descriptor) || isBusy(descriptor))
        .accessibilityLabel(descriptor.accessibilityLabel)
        .accessibilityHint(AdvancedOperationsStrings.actionHint)
        .accessibilityIdentifier(descriptor.accessibilityIdentifier)
      }
    }
  }

  private func isBusy(_ descriptor: AdvancedOperationDescriptor) -> Bool {
    descriptor.isRead ? false : model.activeMutation != nil
  }

  @ViewBuilder
  private var outcomeColumn: some View {
    VStack(alignment: .leading, spacing: 16) {
      if model.isBusy {
        AdvancedOperationsChrome.card {
          Label(AdvancedOperationsStrings.working, systemImage: "clock")
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      AdvancedOperationOutcomeView(outcome: model.mutationOutcome)
      AdvancedOperationOutcomeView(outcome: model.readOutcome)
      if model.mutationOutcome == nil, model.readOutcome == nil, !model.isBusy {
        AdvancedOperationsChrome.card {
          Text(AdvancedOperationsStrings.noOutcome)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }
}

struct AdvancedOperationNoticeView: View {
  let message: String
  let actionTitle: String
  let action: () -> Void

  var body: some View {
    AdvancedOperationsChrome.card {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Label(message, systemImage: "exclamationmark.triangle")
          .frame(maxWidth: .infinity, alignment: .leading)
        Button(actionTitle, action: action)
          .buttonStyle(.plain)
          .font(.callout)
      }
      .accessibilityElement(children: .combine)
      .accessibilityLabel(message)
    }
  }
}
