import SwiftUI
import UIKit

/// Keeps native menu chrome while resolving the icon against the current appearance.
struct PoracodeToolbarMenu<Actions: View>: View {
  @Environment(\.colorScheme) private var colorScheme
  let title: String
  let systemImage: String
  @ViewBuilder let actions: () -> Actions

  var body: some View {
    Menu {
      actions()
    } label: {
      Label {
        Text(title)
      } icon: {
        Image.poracodeToolbarSymbol(systemImage, colorScheme: colorScheme)
      }
    }
  }
}

extension Image {
  /// The native toolbar can replace a template symbol's tint when it bridges the label.
  static func poracodeToolbarSymbol(_ systemImage: String, colorScheme: ColorScheme, isEnabled: Bool = true) -> Image {
    let traits = UITraitCollection(userInterfaceStyle: colorScheme == .dark ? .dark : .light)
    let foreground = (isEnabled ? UIColor.label : UIColor.secondaryLabel).resolvedColor(with: traits)
    let configuration = UIImage.SymbolConfiguration.preferringMonochrome()
    guard let symbol = UIImage(systemName: systemImage, withConfiguration: configuration)
    else { return Image(systemName: systemImage) }
    return Image(uiImage: symbol.withTintColor(foreground, renderingMode: .alwaysOriginal))
      .renderingMode(.original)
  }
}

@available(iOS 27.1, *)
struct PoracodeVerticalBarReader: UIViewRepresentable {
  let hasVerticalBar: Binding<Bool>

  func makeUIView(context: Context) -> TraitView { TraitView() }

  func updateUIView(_ view: TraitView, context: Context) {
    view.report = { value in
      if hasVerticalBar.wrappedValue != value { hasVerticalBar.wrappedValue = value }
    }
    view.publish()
  }

  static func dismantleUIView(_ view: TraitView, coordinator: ()) { view.report = nil }

  final class TraitView: UIView {
    var report: ((Bool) -> Void)?
    private var reported: Bool?

    // These documented UIKit getters were introduced after the release SDK.
    // Resolve them at runtime so the same source also builds with that SDK.
    private static let edge = NSSelectorFromString("verticalBarEdge")
    private static let affectingEdge = NSSelectorFromString("systemTraitsAffectingVerticalBarEdge")

    init() {
      super.init(frame: .zero)
      let traitsType: AnyObject = UITraitCollection.self
      if traitsType.responds(to: Self.affectingEdge),
        let traits = traitsType.perform(Self.affectingEdge)?.takeUnretainedValue() as? [UITrait]
      {
        registerForTraitChanges(traits) { (view: TraitView, _) in view.publish() }
      }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      publish()
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      publish()
    }

    func publish() {
      guard window != nil, report != nil else { return }
      let traits = traitCollection
      let edge = traits.responds(to: Self.edge)
        ? traits.value(forKey: NSStringFromSelector(Self.edge)) as? NSNumber : nil
      let hasVerticalBar = (edge?.intValue ?? 0) != 0
      guard reported != hasVerticalBar else { return }
      reported = hasVerticalBar
      DispatchQueue.main.async { [weak self] in
        guard let self, window != nil, reported == hasVerticalBar else { return }
        report?(hasVerticalBar)
      }
    }
  }
}
