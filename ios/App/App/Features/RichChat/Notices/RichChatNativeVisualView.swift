import Foundation
import SwiftUI

/// Parses and renders `poracode-visual-v1` and `poracode-visual-v2` interactive data visuals
/// natively in SwiftUI (charts, tables, outputs, calculators, checklists, tabs, text, diagrams).
struct NativeVisualDocument: Equatable {
  struct Input: Equatable, Identifiable {
    let id: String
    let label: String
    let min: Double
    let max: Double
    let step: Double
    let defaultValue: Double
  }

  indirect enum Formula: Equatable {
    case literal(Double)
    case input(String)
    case binary(op: String, lhs: Formula, rhs: Formula)

    func evaluate(inputs: [String: Double]) -> Double {
      switch self {
      case .literal(let v): return v
      case .input(let id): return inputs[id] ?? 0
      case .binary(let op, let lhs, let rhs):
        let a = lhs.evaluate(inputs: inputs)
        let b = rhs.evaluate(inputs: inputs)
        switch op {
        case "add": return a + b
        case "subtract": return a - b
        case "multiply": return a * b
        case "divide": return b == 0 ? 0 : a / b
        case "min": return Swift.min(a, b)
        case "max": return Swift.max(a, b)
        default: return 0
        }
      }
    }
  }

  struct ValueFormat: Equatable {
    let style: String
    let currency: String?

    func format(_ value: Double) -> String {
      guard value.isFinite else { return "—" }
      let formatter = NumberFormatter()
      switch style {
      case "percent":
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 1
      case "currency":
        formatter.numberStyle = .currency
        if let currency { formatter.currencyCode = currency }
      default:
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
      }
      return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }
  }

  enum CellValue: Equatable {
    case text(String)
    case formula(Formula)
  }

  struct OutputItem: Equatable {
    let label: String
    let value: Formula
    let format: ValueFormat?
  }

  struct ChartSeries: Equatable {
    let label: String
    let values: [Formula]
  }

  struct ChecklistItem: Equatable, Identifiable {
    let id: String
    let label: String
    let checked: Bool
  }

  struct DiagramNode: Equatable, Identifiable {
    let id: String
    let label: String
    let detail: String?
    let tone: String?
  }

  struct DiagramEdge: Equatable {
    let from: String
    let to: String
    let label: String?
  }

  struct TabItem: Equatable, Identifiable {
    let id: String
    let label: String
    let blocks: [Block]
  }

  enum Block: Equatable {
    case outputs(title: String?, items: [OutputItem])
    case table(title: String?, columns: [(String, ValueFormat?)], rows: [[CellValue]])
    case chart(kind: String, title: String?, labels: [String], series: [ChartSeries], format: ValueFormat?)
    case text(title: String?, body: String)
    case checklist(title: String?, items: [ChecklistItem])
    case diagram(title: String?, nodes: [DiagramNode], edges: [DiagramEdge])
    case tabs(title: String?, items: [TabItem])

    static func == (lhs: Block, rhs: Block) -> Bool {
      switch (lhs, rhs) {
      case (.outputs(let t1, let i1), .outputs(let t2, let i2)): return t1 == t2 && i1 == i2
      case (.text(let t1, let b1), .text(let t2, let b2)): return t1 == t2 && b1 == b2
      case (.checklist(let t1, let i1), .checklist(let t2, let i2)): return t1 == t2 && i1 == i2
      case (.diagram(let t1, let n1, let e1), .diagram(let t2, let n2, let e2)):
        return t1 == t2 && n1 == n2 && e1 == e2
      case (.tabs(let t1, let i1), .tabs(let t2, let i2)): return t1 == t2 && i1 == i2
      case (.chart(let k1, let t1, let l1, let s1, let f1), .chart(let k2, let t2, let l2, let s2, let f2)):
        return k1 == k2 && t1 == t2 && l1 == l2 && s1 == s2 && f1 == f2
      case (.table(let t1, let c1, let r1), .table(let t2, let c2, let r2)):
        return t1 == t2 && r1 == r2 && c1.map(\.0) == c2.map(\.0)
      default: return false
      }
    }
  }

  let title: String
  let description: String?
  let inputs: [Input]
  let blocks: [Block]

  static func parse(language: String, source: String) -> NativeVisualDocument? {
    guard language.hasPrefix("poracode-visual-v1") || language.hasPrefix("poracode-visual-v2"),
      source.utf8.count <= 64 * 1024,
      let data = source.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let rawBlocks = root["blocks"] as? [[String: Any]], !rawBlocks.isEmpty
    else { return nil }

    let title = String(language.drop(while: { !$0.isWhitespace })).trimmingCharacters(in: .whitespaces)
    let description = root["description"] as? String
    let inputs = ((root["inputs"] as? [[String: Any]]) ?? []).compactMap(parseInput)
    let blocks = rawBlocks.compactMap(parseBlock)
    guard !blocks.isEmpty else { return nil }
    return NativeVisualDocument(title: title, description: description, inputs: inputs, blocks: blocks)
  }

  private static func parseInput(_ obj: [String: Any]) -> Input? {
    guard let id = obj["id"] as? String, !id.isEmpty,
      let label = obj["label"] as? String,
      let min = number(obj["min"]),
      let max = number(obj["max"]),
      let step = number(obj["step"]), step > 0, max > min,
      let value = number(obj["value"])
    else { return nil }
    return Input(id: id, label: label, min: min, max: max, step: step, defaultValue: value)
  }

  private static func parseFormula(_ raw: Any?) -> Formula? {
    if let n = number(raw) { return .literal(n) }
    guard let obj = raw as? [String: Any] else { return nil }
    if let input = obj["input"] as? String, !input.isEmpty { return .input(input) }
    if let op = obj["op"] as? String, let args = obj["args"] as? [Any], args.count == 2,
      let lhs = parseFormula(args[0]), let rhs = parseFormula(args[1])
    {
      return .binary(op: op, lhs: lhs, rhs: rhs)
    }
    return nil
  }

  private static func parseFormat(_ raw: Any?) -> ValueFormat? {
    guard let obj = raw as? [String: Any], let style = obj["style"] as? String else { return nil }
    return ValueFormat(style: style, currency: obj["currency"] as? String)
  }

  private static func parseBlock(_ obj: [String: Any]) -> Block? {
    guard let type = obj["type"] as? String else { return nil }
    let title = obj["title"] as? String
    switch type {
    case "outputs":
      let items = ((obj["items"] as? [[String: Any]]) ?? []).compactMap { item -> OutputItem? in
        guard let label = item["label"] as? String, let f = parseFormula(item["value"]) else { return nil }
        return OutputItem(label: label, value: f, format: parseFormat(item["format"]))
      }
      return items.isEmpty ? nil : .outputs(title: title, items: items)
    case "table":
      let cols = ((obj["columns"] as? [[String: Any]]) ?? []).compactMap { c -> (String, ValueFormat?)? in
        guard let label = c["label"] as? String else { return nil }
        return (label, parseFormat(c["format"]))
      }
      let rows = ((obj["rows"] as? [[Any]]) ?? []).map { row in
        row.map { cell -> CellValue in
          if let s = cell as? String { return .text(s) }
          if let f = parseFormula(cell) { return .formula(f) }
          return .text("")
        }
      }
      return cols.isEmpty ? nil : .table(title: title, columns: cols, rows: rows)
    case "chart":
      let kind = (obj["kind"] as? String) ?? "bar"
      let labels = (obj["labels"] as? [String]) ?? []
      let series = ((obj["series"] as? [[String: Any]]) ?? []).compactMap { s -> ChartSeries? in
        guard let label = s["label"] as? String, let rawVals = s["values"] as? [Any] else { return nil }
        let vals = rawVals.compactMap(parseFormula)
        return vals.isEmpty ? nil : ChartSeries(label: label, values: vals)
      }
      return series.isEmpty ? nil : .chart(kind: kind, title: title, labels: labels, series: series, format: parseFormat(obj["format"]))
    case "text":
      guard let body = obj["text"] as? String else { return nil }
      return .text(title: title, body: body)
    case "checklist":
      let items = ((obj["items"] as? [[String: Any]]) ?? []).compactMap { item -> ChecklistItem? in
        guard let id = item["id"] as? String, let label = item["label"] as? String else { return nil }
        return ChecklistItem(id: id, label: label, checked: (item["checked"] as? Bool) ?? false)
      }
      return items.isEmpty ? nil : .checklist(title: title, items: items)
    case "diagram":
      let nodes = ((obj["nodes"] as? [[String: Any]]) ?? []).compactMap { n -> DiagramNode? in
        guard let id = n["id"] as? String, let label = n["label"] as? String else { return nil }
        return DiagramNode(id: id, label: label, detail: n["detail"] as? String, tone: n["tone"] as? String)
      }
      let edges = ((obj["edges"] as? [[String: Any]]) ?? []).compactMap { e -> DiagramEdge? in
        guard let from = e["from"] as? String, let to = e["to"] as? String else { return nil }
        return DiagramEdge(from: from, to: to, label: e["label"] as? String)
      }
      return nodes.isEmpty ? nil : .diagram(title: title, nodes: nodes, edges: edges)
    case "tabs":
      let items = ((obj["tabs"] as? [[String: Any]]) ?? []).compactMap { tab -> TabItem? in
        guard let id = tab["id"] as? String, let label = tab["label"] as? String,
          let sub = tab["blocks"] as? [[String: Any]]
        else { return nil }
        let parsed = sub.compactMap(parseBlock)
        return parsed.isEmpty ? nil : TabItem(id: id, label: label, blocks: parsed)
      }
      return items.isEmpty ? nil : .tabs(title: title, items: items)
    default:
      return nil
    }
  }

  private static func number(_ raw: Any?) -> Double? {
    if let d = raw as? Double { return d }
    if let i = raw as? Int { return Double(i) }
    if let n = raw as? NSNumber { return n.doubleValue }
    return nil
  }
}

struct RichChatNativeVisualView: View {
  let document: NativeVisualDocument
  let rawLanguage: String
  let rawSource: String
  @State private var inputValues: [String: Double]
  @State private var checkedState: [String: Bool] = [:]
  @State private var selectedTabId: String?
  @State private var showSource = false

  init(document: NativeVisualDocument, rawLanguage: String, rawSource: String) {
    self.document = document
    self.rawLanguage = rawLanguage
    self.rawSource = rawSource
    var initial: [String: Double] = [:]
    for input in document.inputs {
      initial[input.id] = min(max(input.defaultValue, input.min), input.max)
    }
    _inputValues = State(initialValue: initial)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        if !document.title.isEmpty {
          Text(document.title).font(.headline)
        }
        Spacer()
        Button(showSource ? "Visual" : "JSON") { showSource.toggle() }
          .font(.caption.weight(.medium))
          .buttonStyle(.borderless)
      }
      if let description = document.description, !description.isEmpty {
        Text(description).font(.footnote).foregroundStyle(.secondary)
      }
      if showSource {
        RichChatMarkdownCodeBlock(language: rawLanguage, source: rawSource)
      } else {
        ForEach(document.inputs) { input in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              Text(input.label).font(.caption).foregroundStyle(.secondary)
              Spacer()
              Text(String(format: "%g", inputValues[input.id] ?? input.defaultValue))
                .font(.caption.monospacedDigit().weight(.medium))
            }
            Slider(
              value: Binding(
                get: { inputValues[input.id] ?? input.defaultValue },
                set: { inputValues[input.id] = $0 }
              ),
              in: input.min...input.max,
              step: input.step
            )
          }
        }
        ForEach(Array(document.blocks.enumerated()), id: \.offset) { _, block in
          renderBlock(block)
        }
      }
    }
    .padding(12)
    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
  }

  @ViewBuilder
  private func renderBlock(_ block: NativeVisualDocument.Block) -> some View {
    switch block {
    case .outputs(let title, let items):
      VStack(alignment: .leading, spacing: 6) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
          ForEach(Array(items.enumerated()), id: \.offset) { _, item in
            let val = item.value.evaluate(inputs: inputValues)
            let formatted = item.format?.format(val) ?? String(format: "%g", val)
            VStack(alignment: .leading, spacing: 2) {
              Text(item.label).font(.caption).foregroundStyle(.secondary)
              Text(formatted).font(.headline.monospacedDigit())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
          }
        }
      }
    case .table(let title, let columns, let rows):
      VStack(alignment: .leading, spacing: 6) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        ScrollView(.horizontal, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
              ForEach(Array(columns.enumerated()), id: \.offset) { _, col in
                Text(col.0).font(.caption.weight(.semibold)).frame(minWidth: 80, alignment: .leading)
              }
            }
            Divider()
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
              HStack(spacing: 12) {
                ForEach(Array(columns.enumerated()), id: \.offset) { idx, col in
                  let cellText: String = {
                    guard idx < row.count else { return "" }
                    switch row[idx] {
                    case .text(let s): return s
                    case .formula(let f):
                      let v = f.evaluate(inputs: inputValues)
                      return col.1?.format(v) ?? String(format: "%g", v)
                    }
                  }()
                  Text(cellText).font(.caption.monospacedDigit()).frame(minWidth: 80, alignment: .leading)
                }
              }
            }
          }
        }
      }
    case .chart(_, let title, let labels, let series, let format):
      VStack(alignment: .leading, spacing: 6) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        let allVals = series.flatMap { $0.values.map { abs($0.evaluate(inputs: inputValues)) } }
        let maxVal = max(allVals.max() ?? 1, 0.0001)
        ForEach(Array(series.enumerated()), id: \.offset) { _, s in
          Text(s.label).font(.caption.weight(.medium)).foregroundStyle(.secondary)
          ForEach(Array(s.values.enumerated()), id: \.offset) { idx, formula in
            let v = formula.evaluate(inputs: inputValues)
            let ratio = max(0, min(1, abs(v) / maxVal))
            let label = idx < labels.count ? labels[idx] : "#\(idx + 1)"
            VStack(alignment: .leading, spacing: 2) {
              HStack {
                Text(label).font(.caption2)
                Spacer()
                Text(format?.format(v) ?? String(format: "%g", v)).font(.caption2.monospacedDigit())
              }
              GeometryReader { geo in
                RoundedRectangle(cornerRadius: 3)
                  .fill(Color.primary.opacity(0.85))
                  .frame(width: max(4, geo.size.width * ratio), height: 8)
              }
              .frame(height: 8)
            }
          }
        }
      }
    case .text(let title, let body):
      VStack(alignment: .leading, spacing: 4) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        Text(body).font(.footnote)
      }
    case .checklist(let title, let items):
      VStack(alignment: .leading, spacing: 6) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        ForEach(items) { item in
          let isChecked = checkedState[item.id] ?? item.checked
          Button {
            checkedState[item.id] = !isChecked
          } label: {
            HStack(spacing: 8) {
              Image(systemName: isChecked ? "checkmark.square.fill" : "square")
                .foregroundStyle(isChecked ? Color.primary : .secondary)
              Text(item.label)
                .font(.footnote)
                .strikethrough(isChecked)
                .foregroundStyle(isChecked ? .secondary : .primary)
              Spacer()
            }
          }
          .buttonStyle(.plain)
        }
      }
    case .diagram(let title, let nodes, let edges):
      VStack(alignment: .leading, spacing: 6) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        ForEach(nodes) { node in
          VStack(alignment: .leading, spacing: 2) {
            Text(node.label).font(.caption.weight(.semibold))
            if let detail = node.detail, !detail.isEmpty {
              Text(detail).font(.caption2).foregroundStyle(.secondary)
            }
          }
          .padding(8)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
        }
        ForEach(Array(edges.enumerated()), id: \.offset) { _, edge in
          let fromLabel = nodes.first(where: { $0.id == edge.from })?.label ?? edge.from
          let toLabel = nodes.first(where: { $0.id == edge.to })?.label ?? edge.to
          let suffix = edge.label.map { " (\($0))" } ?? ""
          Text("\(fromLabel) → \(toLabel)\(suffix)").font(.caption2).foregroundStyle(.secondary)
        }
      }
    case .tabs(let title, let items):
      VStack(alignment: .leading, spacing: 8) {
        if let title { Text(title).font(.subheadline.weight(.semibold)) }
        let activeId = selectedTabId ?? items.first?.id
        Picker("", selection: Binding(
          get: { activeId ?? "" },
          set: { selectedTabId = $0 }
        )) {
          ForEach(items) { tab in Text(tab.label).tag(tab.id) }
        }
        .pickerStyle(.segmented)
        if let active = items.first(where: { $0.id == activeId }) ?? items.first {
          ForEach(Array(active.blocks.enumerated()), id: \.offset) { _, sub in
            AnyView(renderBlock(sub))
          }
        }
      }
    }
  }
}
