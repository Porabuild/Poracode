import SwiftUI

/// Project notes and to-dos, mirroring the mobile web Notes panel: a free-form
/// notes editor followed by a checklist with an inline add row.
struct ProjectNotesView: View {
  private struct LoadTarget: Hashable {
    let identity: ProjectIdentity
    let lease: ProjectControllerHostLease?
  }

  @Bindable var session: AppSession
  let identity: ProjectIdentity
  @Bindable var controller: ProjectControllerNotesController

  @Environment(\.poracodeEmbeddedInInspector) private var embeddedInInspector
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.poracodeTheme) private var theme
  @ScaledMetric(relativeTo: .body) private var compactEditorHeight: CGFloat = 82
  @ScaledMetric(relativeTo: .body) private var wideEditorHeight: CGFloat = 120
  @FocusState private var todoEntryFocused: Bool
  @State private var selectedNoteText = ""
  @State private var noteEditorIsActive = false
  @State private var activeNoteFormats = Set<ProjectNoteFormat>()
  @State private var noteEditorCommand: ProjectNoteEditorCommand?
  @State private var newTodo = ""
  @State private var renamingTodo: ProjectNoteTodo?
  @State private var renameText = ""
  @State private var composeIntent: ProjectNotesThreadComposeIntent?
  @State private var startedThread: ProjectNotesStartedThread?

  var body: some View {
    Group {
      switch state.loadState {
      case .idle, .loading:
        LoadingStateView(message: ProjectManagementStrings.loadingNotes)
      case .failed(let failure):
        ErrorStateView(
          message: ProjectFailureText.message(for: failure),
          retryTitle: ProjectManagementStrings.retry
        ) {
          Task { await controller.load(identity) }
        }
      case .empty, .loaded:
        noteList
      }
    }
    .poracodeThemeBackground(theme.variant(for: colorScheme).background)
    .poracodeNavigationTitle(ProjectManagementStrings.notes, suppressed: embeddedInInspector)
    .toolbar {
      if noteEditorIsActive {
        ToolbarItemGroup(placement: .keyboard) {
          Button {
            noteEditorCommand = ProjectNoteEditorCommand(format: .bold)
          } label: {
            Image(systemName: "bold")
              .foregroundStyle(activeNoteFormats.contains(.bold) ? Color.primary : Color.secondary)
          }
          .accessibilityLabel(ProjectManagementStrings.bold)

          Button {
            noteEditorCommand = ProjectNoteEditorCommand(format: .italic)
          } label: {
            Image(systemName: "italic")
              .foregroundStyle(
                activeNoteFormats.contains(.italic) ? Color.primary : Color.secondary
              )
          }
          .accessibilityLabel(ProjectManagementStrings.italic)

          Spacer()
          Button {
            startThread(with: selectedNoteText)
          } label: {
            Label(HomeStrings.newThread, systemImage: "plus.bubble")
          }
          .disabled(cleanSelectedNoteText.isEmpty)
        }
      }
    }
    .task(id: LoadTarget(identity: identity, lease: controller.session?.lease)) {
      await controller.load(identity)
    }
    .refreshable { await controller.load(identity) }
    .onDisappear {
      Task { await controller.flushPendingEdit(for: identity) }
    }
    .overlay(alignment: .bottom) {
      if state.isSaving {
        ProgressView()
          .padding(10)
          .poracodeGlassBackground(in: Capsule())
          .padding()
          .allowsHitTesting(false)
      } else if state.conflict {
        VStack(alignment: .leading, spacing: 8) {
          Text(ProjectManagementStrings.notesConflict).font(.caption)
          Button(ProjectManagementStrings.loadSavedNotes) {
            Task { await controller.load(identity, discardDraft: true) }
          }
          .accessibilityIdentifier("native-e2e.notes.load-saved")
        }
        .padding(10)
        .poracodeGlassBackground(in: RoundedRectangle(cornerRadius: 12))
        .padding()
      } else if let failure = state.failure {
        ProjectFailureBanner(failure: failure)
          .padding()
      }
    }
    .alert(
      ProjectManagementStrings.renameTodoTitle,
      isPresented: Binding(
        get: { renamingTodo != nil },
        set: { if !$0 { renamingTodo = nil } }
      )
    ) {
      TextField(ProjectManagementStrings.renameTodoTitle, text: $renameText)
      Button(ProjectManagementStrings.save) {
        if let todo = renamingTodo {
          rename(todo, to: renameText)
        }
        renamingTodo = nil
      }
      Button(ProjectManagementStrings.cancel, role: .cancel) {
        renamingTodo = nil
      }
    }
    .sheet(item: $composeIntent) { intent in
      ProjectNotesThreadComposeSheet(session: session, intent: intent) { target in
        startedThread = target
      }
      .poracodeFormSheetSizing()
    }
    .navigationDestination(item: $startedThread) { target in
      ProjectNotesThreadDestination(session: session, target: target)
    }
  }

  private var noteList: some View {
    ScrollViewReader { scroll in
      GeometryReader { geometry in
        // The keyboard changes the scroll viewport while the note keeps its reading height.
        noteList(editorHeight: geometry.size.width < 480 ? compactEditorHeight : wideEditorHeight)
          .onChange(of: todoEntryFocused) {
            if todoEntryFocused { scroll.scrollTo(EntryAnchor.todo) }
          }
          .onChange(of: geometry.size) {
            if todoEntryFocused { scroll.scrollTo(EntryAnchor.todo) }
          }
          .onChange(of: todos.count) {
            if todoEntryFocused { scroll.scrollTo(EntryAnchor.todo) }
          }
      }
    }
    .poracodeUseKeyboardLayoutGuide()
  }

  private enum EntryAnchor: Hashable {
    case todo
  }

  private let cardInsets = EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16)

  private var cardColor: Color {
    let palette = theme.variant(for: colorScheme)
    if colorScheme == .dark {
      // Keep grouped rows gently elevated even when a custom theme uses dark panels.
      return Color(poracodeHex: PoracodeThemeColorMix.mix(
        palette.backgroundHex, palette.foregroundHex, amount: 0.09
      ))
    }
    return palette.surface
  }

  private func noteList(editorHeight: CGFloat) -> some View {
    List {
      Section {
        ZStack(alignment: .topLeading) {
          ProjectNoteTextEditor(
            document: Binding(get: { state.draft?.doc }, set: { edit(doc: $0) }),
            selectedText: $selectedNoteText,
            isEditing: $noteEditorIsActive,
            activeFormats: $activeNoteFormats,
            command: noteEditorCommand
          )
          .frame(height: editorHeight)
          .accessibilityIdentifier("native-e2e.notes.editor")
          .privacySensitive()
          if notePlainText.isEmpty {
            Text(ProjectManagementStrings.notesPlaceholder)
              .foregroundStyle(Color.poracodeSecondaryLabel)
              .padding(.top, 8)
              .allowsHitTesting(false)
          }
        }
        .listRowInsets(cardInsets)
        .listRowBackground(cardColor)
      }

      Section {
        ForEach(todos) { todo in
          todoRow(todo)
            .listRowInsets(cardInsets)
            .listRowBackground(cardColor)
            .contextMenu {
              Button(ProjectManagementStrings.renameTodoAction, systemImage: "pencil") {
                beginRename(todo)
              }
              Button(HomeStrings.newThread, systemImage: "plus.bubble") {
                startThread(with: todo.text)
              }
              Button(ProjectManagementStrings.deleteTodo, systemImage: "trash", role: .destructive)
              {
                edit(todos: ProjectNoteEditing.deleting(todo, from: todos))
              }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
              Button(role: .destructive) {
                edit(todos: ProjectNoteEditing.deleting(todo, from: todos))
              } label: {
                Label(ProjectManagementStrings.deleteTodo, systemImage: "trash")
              }
              Button {
                beginRename(todo)
              } label: {
                Label(ProjectManagementStrings.renameTodoAction, systemImage: "pencil")
              }
              .tint(.gray)
            }
        }
        .onMove { source, destination in
          var updated = todos
          updated.move(fromOffsets: source, toOffset: destination)
          edit(todos: updated)
        }
        todoEntry
          .listRowInsets(cardInsets)
          .listRowBackground(cardColor)
          .id(EntryAnchor.todo)
      } header: {
        HStack(alignment: .firstTextBaseline) {
          Text(ProjectManagementStrings.todos)
            .font(.headline)
            .foregroundStyle(.primary)
          Spacer()
          if !todos.isEmpty {
            Text(ProjectManagementStrings.openTodos(openCount))
              .font(.subheadline)
              .foregroundStyle(Color.poracodeSecondaryLabel)
          }
        }
        .textCase(nil)
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(.compact)
    .scrollContentBackground(.hidden)
    .contentMargins(.top, 4, for: .scrollContent)
    .contentMargins(.bottom, 16, for: .scrollContent)
    .environment(\.defaultMinListRowHeight, 44)
    .poracodeReadableWidth(680)
    .scrollDismissesKeyboard(.interactively)
  }

  private var todoEntry: some View {
    HStack(spacing: 12) {
      TextField(
        ProjectManagementStrings.newTodo, text: $newTodo,
        prompt: Text(ProjectManagementStrings.newTodo).foregroundStyle(Color.poracodeSecondaryLabel)
      )
      .focused($todoEntryFocused)
      .submitLabel(.done)
      .onSubmit(addTodo)
      .accessibilityLabel(ProjectManagementStrings.newTodo)
      .accessibilityIdentifier("native-e2e.notes.new-todo")
      .frame(minHeight: 44)

      Button(ProjectManagementStrings.addTodo, systemImage: "plus", action: addTodo)
        .labelStyle(.iconOnly)
        .buttonBorderShape(.circle)
        .controlSize(.large)
        .poracodeGlassButtonStyle(tint: canAddTodo ? .primary : .poracodeSecondaryLabel)
        .disabled(!canAddTodo)
    }
  }

  private func todoRow(_ todo: ProjectNoteTodo) -> some View {
    Button {
      edit(todos: ProjectNoteEditing.toggling(todo, in: todos))
    } label: {
      HStack(spacing: 12) {
        Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(todo.done ? Color.primary : .poracodeSecondaryLabel)
          .accessibilityHidden(true)
        Text(todo.text)
          .foregroundStyle(todo.done ? Color.poracodeSecondaryLabel : .primary)
          .strikethrough(todo.done)
        Spacer()
      }
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .accessibilityLabel(
      todo.done
        ? ProjectManagementStrings.markAsNotDone(todo.text)
        : ProjectManagementStrings.markAsDone(todo.text)
    )
    .accessibilityAction(named: HomeStrings.newThread) {
      startThread(with: todo.text)
    }
  }

  private var cleanSelectedNoteText: String {
    ProjectValidation.jsTrim(selectedNoteText)
  }

  private var notePlainText: String {
    ProjectNoteDocument.text(state.draft?.doc)
  }

  private var state: ProjectControllerNotesState {
    controller.state(for: identity)
  }

  private var todos: [ProjectNoteTodo] {
    state.draft?.todos ?? []
  }

  private var openCount: Int {
    todos.filter { !$0.done }.count
  }

  private var canAddTodo: Bool {
    !ProjectValidation.jsTrim(newTodo).isEmpty
  }

  private func addTodo() {
    todoEntryFocused = false
    guard canAddTodo else { return }
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let updated = ProjectNoteEditing.adding(
      text: newTodo,
      to: todos,
      now: timestamp,
      id: UUID().uuidString.lowercased()
    )
    guard updated != todos else { return }
    newTodo = ""
    edit(todos: updated, updatedAt: timestamp)
  }

  private func rename(_ todo: ProjectNoteTodo, to text: String) {
    let trimmed = ProjectValidation.jsTrim(text)
    guard !trimmed.isEmpty else { return }
    let updated = todos.map { current in
      current.id == todo.id
        ? ProjectNoteTodo(
          id: current.id,
          text: trimmed,
          done: current.done,
          createdAt: current.createdAt
        ) : current
    }
    edit(todos: updated)
  }

  private func beginRename(_ todo: ProjectNoteTodo) {
    renameText = todo.text
    renamingTodo = todo
  }

  private func startThread(with text: String) {
    let prompt = ProjectValidation.jsTrim(text)
    guard !prompt.isEmpty else { return }
    composeIntent = ProjectNotesThreadComposeIntent(identity: identity, prompt: prompt)
  }

  private func edit(todos: [ProjectNoteTodo], updatedAt: String? = nil) {
    edit(doc: state.draft?.doc, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, updatedAt: String? = nil) {
    edit(doc: doc, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String?) {
    let timestamp = updatedAt ?? ISO8601DateFormatter().string(from: Date())
    controller.edit(identity, doc: doc, todos: todos, updatedAt: timestamp)
  }
}
