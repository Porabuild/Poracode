import SwiftUI

/// Project notes and to-dos, mirroring the mobile web Notes panel: a free-form
/// notes editor above a to-do list, with the add row at the bottom.
struct ProjectNotesView: View {
  @Bindable var session: AppSession
  let identity: ProjectIdentity
  @Bindable var controller: ProjectControllerNotesController

  @State private var noteDocument: JSONValue?
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
    .navigationTitle(ProjectManagementStrings.notes)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Button {
          noteEditorCommand = ProjectNoteEditorCommand(format: .bold)
        } label: {
          Image(systemName: "bold")
            .foregroundStyle(activeNoteFormats.contains(.bold) ? Color.accentColor : Color.primary)
        }
        .disabled(!noteEditorIsActive)
        .accessibilityLabel(ProjectManagementStrings.bold)

        Button {
          noteEditorCommand = ProjectNoteEditorCommand(format: .italic)
        } label: {
          Image(systemName: "italic")
            .foregroundStyle(
              activeNoteFormats.contains(.italic) ? Color.accentColor : Color.primary
            )
        }
        .disabled(!noteEditorIsActive)
        .accessibilityLabel(ProjectManagementStrings.italic)

        Spacer()
        Button {
          startThread(with: selectedNoteText)
        } label: {
          Label(HomeStrings.newThread, systemImage: "plus.bubble")
        }
        .disabled(!noteEditorIsActive || cleanSelectedNoteText.isEmpty)
      }
    }
    .task(id: identity) {
      await controller.load(identity)
    }
    .refreshable { await controller.load(identity) }
    .onChange(of: state.loadState) { _, loadState in
      if case .loaded = loadState { noteDocument = state.draft?.doc }
      if case .empty = loadState { noteDocument = nil }
    }
    .onChange(of: state.failure) { _, failure in
      guard failure != nil else { return }
      noteDocument = state.lastConfirmed?.doc
    }
    .overlay(alignment: .bottom) {
      if state.isSaving {
        ProgressView()
          .padding(10)
          .poracodeGlassBackground(in: Capsule())
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
    }
    .navigationDestination(item: $startedThread) { target in
      ProjectNotesThreadDestination(session: session, target: target)
    }
  }

  private var noteList: some View {
    GeometryReader { geometry in
      noteList(editorHeight: max(220, geometry.size.height * 0.42))
    }
  }

  private func noteList(editorHeight: CGFloat) -> some View {
    List {
      Section {
        ZStack(alignment: .topLeading) {
          ProjectNoteTextEditor(
            document: $noteDocument,
            selectedText: $selectedNoteText,
            isEditing: $noteEditorIsActive,
            activeFormats: $activeNoteFormats,
            command: noteEditorCommand
          )
          .frame(minHeight: editorHeight)
          .accessibilityIdentifier("native-e2e.notes.editor")
          .privacySensitive()
          .onChange(of: noteDocument) { _, document in
            edit(doc: document)
          }
          if notePlainText.isEmpty {
            Text(ProjectManagementStrings.notesPlaceholder)
              .foregroundStyle(.tertiary)
              .padding(.top, 10)
              .padding(.leading, 6)
              .allowsHitTesting(false)
          }
        }
      }

      Section {
        ForEach(todos) { todo in
          todoRow(todo)
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
              .tint(.accentColor)
            }
        }
        .onMove { source, destination in
          var updated = todos
          updated.move(fromOffsets: source, toOffset: destination)
          edit(todos: updated)
        }

        HStack {
          TextField(ProjectManagementStrings.newTodo, text: $newTodo)
          Button(ProjectManagementStrings.addTodo, systemImage: "plus.circle.fill") {
            addTodo()
          }
          .labelStyle(.iconOnly)
          .disabled(ProjectValidation.jsTrim(newTodo).isEmpty)
        }
      } header: {
        HStack {
          Text(ProjectManagementStrings.todos)
          Spacer()
          Text(ProjectManagementStrings.openTodos(openCount))
            .font(.caption.weight(.regular))
            .foregroundStyle(.secondary)
        }
      }
    }
    .listStyle(.insetGrouped)
    .scrollDismissesKeyboard(.interactively)
  }

  private func todoRow(_ todo: ProjectNoteTodo) -> some View {
    Button {
      edit(todos: ProjectNoteEditing.toggling(todo, in: todos))
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(todo.done ? .green : .secondary)
        Text(todo.text)
          .foregroundStyle(.primary)
          .strikethrough(todo.done)
        Spacer()
      }
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
    ProjectNoteDocument.text(noteDocument)
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

  private func addTodo() {
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
    edit(doc: noteDocument, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, updatedAt: String? = nil) {
    edit(doc: doc, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String?) {
    let timestamp = updatedAt ?? ISO8601DateFormatter().string(from: Date())
    controller.edit(identity, doc: doc, todos: todos, updatedAt: timestamp)
  }
}
