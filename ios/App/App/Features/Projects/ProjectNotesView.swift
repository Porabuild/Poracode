import SwiftUI

/// Project notes and to-dos, mirroring the mobile web Notes panel: a free-form
/// notes editor above a to-do list, with the add row at the bottom.
struct ProjectNotesView: View {
  let identity: ProjectIdentity
  @Bindable var controller: ProjectControllerNotesController

  @State private var noteText = ""
  @State private var newTodo = ""
  @State private var renamingTodo: ProjectNoteTodo?
  @State private var renameText = ""

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
    .task(id: identity) {
      await controller.load(identity)
    }
    .refreshable { await controller.load(identity) }
    .onChange(of: state.loadState) { _, loadState in
      if case .loaded = loadState { noteText = ProjectNoteDocument.text(state.draft?.doc) }
      if case .empty = loadState { noteText = "" }
    }
    .onChange(of: state.failure) { _, failure in
      guard failure != nil else { return }
      noteText = ProjectNoteDocument.text(state.lastConfirmed?.doc)
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
  }

  private var noteList: some View {
    List {
      Section {
        ZStack(alignment: .topLeading) {
          TextEditor(text: $noteText)
            .frame(minHeight: 140)
            .privacySensitive()
            .onChange(of: noteText) { _, text in
              edit(doc: ProjectNoteDocument.fromText(text))
            }
          if noteText.isEmpty {
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
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
              Button(role: .destructive) {
                edit(todos: ProjectNoteEditing.deleting(todo, from: todos))
              } label: {
                Label(ProjectManagementStrings.deleteTodo, systemImage: "trash")
              }
              Button {
                renameText = todo.text
                renamingTodo = todo
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
      current.id == todo.id ? ProjectNoteTodo(
        id: current.id,
        text: trimmed,
        done: current.done,
        createdAt: current.createdAt
      ) : current
    }
    edit(todos: updated)
  }

  private func edit(todos: [ProjectNoteTodo], updatedAt: String? = nil) {
    let doc = todos == self.todos ? ProjectNoteDocument.fromText(noteText) : state.draft?.doc
    edit(doc: doc, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, updatedAt: String? = nil) {
    edit(doc: doc, todos: todos, updatedAt: updatedAt)
  }

  private func edit(doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String?) {
    let timestamp = updatedAt ?? ISO8601DateFormatter().string(from: Date())
    controller.edit(identity, doc: doc, todos: todos, updatedAt: timestamp)
  }
}
