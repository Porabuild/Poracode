import Observation
import SwiftUI

struct NativeShortcutSettingsView: View {
  @Bindable var store: NativeKeybindingStore
  @State private var query = ""
  @State private var showsReset = false
  @State private var selectedCommand: NativeShortcutCommandRoute?
  @State private var searchPresented = false

  init(store: NativeKeybindingStore = .shared) { self.store = store }

  var body: some View {
    List {
      if store.storageIssue != nil {
        Section {
          Label(NativeShortcutStrings.unavailableStorage, systemImage: "exclamationmark.triangle")
            .foregroundStyle(.secondary)
        }
      } else {
        ForEach(groups, id: \.0) { group in
          Section(group.0) {
            ForEach(group.1, id: \.self) { command in
                Button {
                  searchPresented = false
                  selectedCommand = .init(command: command)
                } label: {
                  HStack {
                    VStack(alignment: .leading, spacing: 4) {
                      Text(NativeShortcutStrings.commandTitle(command)).foregroundStyle(.primary)
                      Text(keys(for: command)).font(.caption.monospaced()).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
                  }
                  .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-e2e.keyboard.command.\(command)")
            }
          }
        }
      }
      Section { Text(NativeShortcutStrings.localOnly).font(.footnote).foregroundStyle(.secondary) }
    }
    .accessibilityIdentifier("native-e2e.keyboard.catalog")
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(NativeShortcutStrings.title)
    .navigationBarTitleDisplayMode(.inline)
    .searchable(text: $query, isPresented: $searchPresented, prompt: NativeShortcutStrings.search)
    .navigationDestination(item: $selectedCommand) { route in
      NativeShortcutCommandView(store: store, command: route.command)
    }
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        PoracodeToolbarIconButton(title: NativeShortcutStrings.reset, systemImage: "arrow.counterclockwise") { showsReset = true }
          .accessibilityIdentifier("native-e2e.keyboard.reset-all")
      }
    }
    .confirmationDialog(NativeShortcutStrings.resetAllMessage, isPresented: $showsReset, titleVisibility: .visible) {
      Button(NativeShortcutStrings.reset, role: .destructive) { store.resetAll() }
      Button(NativeShortcutStrings.cancel, role: .cancel) {}
    }
  }

  private func keys(for command: String) -> String {
    let keys = store.entries.filter { $0.command == command }.compactMap { $0.chord?.nativeDisplay }
    return keys.isEmpty ? NativeShortcutStrings.noShortcut : keys.joined(separator: "  ·  ")
  }

  private var groups: [(String, [String])] {
    let commands = Set(NativeShortcutStrings.titles.keys).union(store.entries.map(\.command))
      .intersection(NativeShortcutPlatformPolicy.supportedCommands)
      .filter { command in
        query.isEmpty || NativeShortcutStrings.commandTitle(command).localizedCaseInsensitiveContains(query)
          || command.localizedCaseInsensitiveContains(query) || keys(for: command).localizedCaseInsensitiveContains(query)
      }
    let definitions: [(String, (String) -> Bool)] = [
      ("Poracode", { !["thread.", "editor.", "browser.", "composer."].contains(where: $0.hasPrefix) && NativeShortcutStrings.titles[$0] != nil }),
      (NativeShortcutStrings.threads, { $0.hasPrefix("thread.") }),
      (ProjectWorkspaceStrings.files, { $0.hasPrefix("editor.") }),
      (BrowserMirrorStrings.title, { $0.hasPrefix("browser.") }),
      (NativeShortcutStrings.composer, { $0.hasPrefix("composer.") }),
      (NativeShortcutStrings.other, { NativeShortcutStrings.titles[$0] == nil && !["thread.", "editor.", "browser.", "composer."].contains(where: $0.hasPrefix) }),
    ]
    return definitions.compactMap { title, matches in
      let values = commands.filter(matches).sorted { NativeShortcutStrings.commandTitle($0).localizedStandardCompare(NativeShortcutStrings.commandTitle($1)) == .orderedAscending }
      return values.isEmpty ? nil : (title, values)
    }
  }
}

struct NativeShortcutCommandRoute: Hashable { let command: String }

struct NativeShortcutCommandView: View {
  @Bindable var store: NativeKeybindingStore
  let command: String
  @State private var editing: NativeShortcutEditTarget?
  @State private var showsReset = false
  @State private var failure: String?

  var body: some View {
    List {
      Section {
        ForEach(indices, id: \.self) { index in
          let entry = store.entries[index]
          Button {
            editing = NativeShortcutEditTarget(command: command, index: index, original: entry, condition: entry.condition)
          } label: {
            VStack(alignment: .leading, spacing: 4) {
              Text(entry.chord?.nativeDisplay ?? entry.rawChord ?? NativeShortcutStrings.noShortcut)
                .font(.body.monospaced()).foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("native-e2e.keyboard.binding.\(command).\(index)")
          .swipeActions { removeAction(index: index, entry: entry) }
          .contextMenu { removeAction(index: index, entry: entry) }
          .accessibilityActions { removeAction(index: index, entry: entry) }
        }
        if indices.isEmpty { Text(NativeShortcutStrings.noShortcut).foregroundStyle(.secondary) }
      }
      if let failure { Section { Text(failure).foregroundStyle(.red) } }
      Section {
        Button { showsReset = true } label: {
          Label(NativeShortcutStrings.reset, systemImage: "arrow.counterclockwise")
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
        }
          .buttonStyle(.plain).disabled(!store.canEdit)
          .accessibilityIdentifier("native-e2e.keyboard.reset-command")
      }
    }
    .listStyle(.insetGrouped)
    .poracodeReadableListMargins(740)
    .navigationTitle(NativeShortcutStrings.commandTitle(command))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .bottomBar) {
        Button(NativeShortcutStrings.add, systemImage: "plus") {
          editing = NativeShortcutEditTarget(command: command, condition: store.defaults.entries.first { $0.command == command }?.condition)
        }
        .disabled(!store.canEdit)
        .accessibilityIdentifier("native-e2e.keyboard.add")
      }
    }
    .sheet(item: $editing) { target in
      NativeShortcutBindingEditor(store: store, target: target).poracodeFormSheetSizing()
    }
    .confirmationDialog(NativeShortcutStrings.reset, isPresented: $showsReset, titleVisibility: .visible) {
      Button(NativeShortcutStrings.reset, role: .destructive) {
        do { try store.reset(command: command) } catch { failure = NativeShortcutStrings.changed }
      }
      Button(NativeShortcutStrings.cancel, role: .cancel) {}
    }
  }

  private var indices: [Int] { store.entries.indices.filter { store.entries[$0].command == command } }

  private func removeAction(index: Int, entry: NativeKeybindingEntry) -> some View {
    Button(role: .destructive) {
      do { try store.remove(at: index, expected: entry) } catch { failure = NativeShortcutStrings.changed }
    } label: {
      PoracodeActionLabel(NativeShortcutStrings.remove, systemImage: "trash", tone: .destructive)
    }
    .buttonStyle(.plain)
  }
}

@Observable
final class NativeShortcutEditTarget: Identifiable {
  let id = UUID()
  let command: String
  let index: Int?
  let original: NativeKeybindingEntry?
  let condition: String?
  var rawKey: String

  init(command: String, index: Int? = nil, original: NativeKeybindingEntry? = nil, condition: String?) {
    self.command = command
    self.index = index
    self.original = original
    self.condition = condition
    rawKey = original?.chord?.editableDisplay ?? original?.rawChord ?? ""
  }
}
