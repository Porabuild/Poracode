import SwiftUI

private struct ToolPresentationCatalogKey: EnvironmentKey {
  static let defaultValue: RichToolPresentationCatalog? = nil
}

extension EnvironmentValues {
  var toolPresentationCatalog: RichToolPresentationCatalog? {
    get { self[ToolPresentationCatalogKey.self] }
    set { self[ToolPresentationCatalogKey.self] = newValue }
  }
}

struct RichToolActivityItemView: View {
  let item: RichRuntimeItem
  let fallbackText: String
  let mediaController: RichChatMediaController
  @Environment(\.toolPresentationCatalog) private var catalog
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let presentation = catalog?.itemTypes[item.type] {
        RichChatPresentedTool(item: item, presentation: presentation, mediaController: mediaController)
      } else {
        RichChatActivityRow(title: RichChatPresentation.typeLabel(for: item), text: fallbackText,
          icon: .init(category: RichChatActivityGroupSummary.category(for: item)), duration: nil,
          isWorking: item.state != .completed, disclosureID: "item:\(item.id)")
      }
      ForEach(RichChatVideoPresentation.videos(for: item)) { video in RichChatInlineVideo(video: video) }
    }
  }
}

struct RichChatPresentedTool: View {
  let item: RichRuntimeItem
  let presentation: RichToolPresentation
  let mediaController: RichChatMediaController
  @State private var localExpanded = false
  @Environment(\.transcriptDisclosures) private var disclosures
  @Environment(\.runtimeItemHeadings) private var headings
  @Environment(\.runtimeItemHeadingSnapshot) private var snapshot
  @Environment(\.workflowViewerContext) private var viewerContext
  @Environment(\.workflowViewerPresentation) private var viewerPresenter
  private var heading: RichRuntimeItemHeading? {
    snapshot[item.id]?.displayHeading(for: item, projection: presentation.headerProjection)
      ?? headings?.heading(item, projection: presentation.headerProjection)
  }
  private var failed: Bool {
    item.state == .completed && (heading?.failed == true || item.payload?.objectValue?["status"]?.stringValue == "error")
  }
  private var expansion: Binding<Bool> {
    TranscriptDisclosureContext.binding(disclosures, id: "item:\(item.id)", fallback: $localExpanded)
  }
  private var expanded: Bool { expansion.wrappedValue }

  private var images: [RichImagePresentation] { RichToolMediaProjection.images(presentation, item: item) }
  private func detailsAvailable(for body: RichResolvedToolBody?) -> Bool {
    if !images.isEmpty { return true }
    guard body?.replacesCanonicalSections == true else { return !presentation.sections.isEmpty }
    guard viewerContext?.owner != nil, viewerPresenter != nil else { return false }
    return WorkflowRunReference(metadata: item.payload?.objectValue?["workflow"]) != nil
      || presentation.workflowViewProjection?.matches(item) == true
  }
  private var title: String {
    if let heading { return heading.displayTitle }
    guard let header = presentation.header else { return RichChatPresentation.typeLabel(for: item) }
    let text = RichToolTextProjection.resolve(header.source, payload: item.payload, streams: item.streams).text
    guard !text.isEmpty else { return RichChatPresentation.typeLabel(for: item) }
    let context = header.context.map { RichToolTextProjection.resolve($0, payload: item.payload, streams: item.streams).text } ?? ""
    let name = context.isEmpty ? text : "\(context) · \(text)"
    return [headerLabel(header).map(ToolPresentationStrings.label), name].compactMap { $0 }.joined(separator: ": ")
  }
  private func headerLabel(_ header: RichToolHeader) -> String? {
    guard let choice = header.labelChoice else { return header.label }
    let value = RichToolTextProjection.resolve(choice.source, payload: item.payload, streams: item.streams).text
    return choice.values[value] ?? header.label
  }
  @ViewBuilder private var titleView: some View {
    if let heading {
      RichRuntimeItemHeadingLabel(heading: heading)
    } else if let header = presentation.header, header.isPath {
      let path = RichToolTextProjection.resolve(header.source, payload: item.payload, streams: item.streams).text
        .replacingOccurrences(of: "\\", with: "/")
      let components = path.split(separator: "/", omittingEmptySubsequences: false)
      HStack(spacing: 4) {
        if let label = headerLabel(header) { Text(ToolPresentationStrings.label(label)) }
        Text(components.last.map(String.init).flatMap { $0.isEmpty ? nil : $0 } ?? path)
          .lineLimit(1).truncationMode(.middle)
        if components.count > 1 {
          Text(components.dropLast().joined(separator: "/"))
            .foregroundStyle(.tertiary).lineLimit(1).truncationMode(.head)
        }
      }
      .accessibilityElement(children: .ignore).accessibilityLabel(title)
    } else {
      Text(title).lineLimit(1).truncationMode(.middle)
    }
  }

  var body: some View {
    RichRuntimeToolBodyRead(item: item, projection: presentation.bodyProjection) { resolvedBody in
      let showsDetails = detailsAvailable(for: resolvedBody)
      VStack(alignment: .leading, spacing: 4) {
        Button {
          withAnimation(.snappy(duration: 0.22)) { expansion.wrappedValue = !expanded }
        } label: {
          HStack(spacing: 7) {
            Group {
              if failed { Image(systemName: "exclamationmark.circle") }
              else { RichChatIcon(heading?.icon ?? .init(category: RichChatActivityGroupSummary.category(for: item))) }
            }
              .font(.system(size: 14)).frame(width: 18)
              .foregroundStyle(failed ? Color.red : Color.secondary)
            titleView.fontWeight(.medium)
            Spacer(minLength: 0)
            if item.state == .completed, let text = heading?.durationText {
              Text(text).foregroundStyle(failed ? Color.red : Color.secondary)
            }
            if item.state != .completed { ProgressView().controlSize(.mini) }
            if showsDetails {
              Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                .rotationEffect(.degrees(expanded ? 180 : 0))
            }
          }
          .poracodeChatText(.metadata)
          .foregroundStyle(.secondary)
          .richChatActivityHeaderLayout()
        }
        .buttonStyle(.plain)
        .disabled(!showsDetails)
        .accessibilityIdentifier("native-e2e.tool-details.\(item.id)")
        .accessibilityValue((failed ? ToolPresentationStrings.label("error") + ", " : "")
          + (showsDetails ? (expanded ? ToolPresentationStrings.expanded : ToolPresentationStrings.collapsed) : ""))

        if expanded {
          RichWorkflowViewerAccessory(item: item)
          if resolvedBody?.replacesCanonicalSections != true {
            ForEach(RichToolTextProjection.sections(presentation, item: item)) { section in
              RichToolSectionView(item: item, section: section.descriptor, part: section.part, index: section.id)
            }
          }
          ForEach(images) { image in RichChatImageView(source: image, controller: mediaController) }
        }
        if let resolvedBody { RichResolvedToolBodyView(presentation: resolvedBody, itemID: item.id) }
      }
      .padding(.leading, 16)
      .modifier(RuntimeItemHeadingRequests(items: [item]))
    }
  }
}

private struct RichToolSectionView: View {
  let item: RichRuntimeItem
  let section: RichToolSection
  let part: RichToolTextPart
  let index: Int

  var body: some View {
    if !part.text.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        if let label = section.label {
          Text(ToolPresentationStrings.label(label))
            .font(.caption2.weight(.medium)).foregroundStyle(.secondary)
        }
        if section.kind == .markdown && part.language == "plain" {
          RichChatMarkdownView(source: section.prefix + part.text)
        } else if part.language == "diff" {
          ScrollView { NativeUnifiedDiffView(diff: part.text) }
            .frame(maxHeight: 340)
            .accessibilityIdentifier("native-e2e.tool-section.\(item.id).\(index)")
        } else {
          RichToolCodeBlock(text: section.prefix + part.text,
            identifier: "native-e2e.tool-section.\(item.id).\(index)")
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("native-e2e.tool-section-container.\(item.id).\(index)")
    }
  }

}
