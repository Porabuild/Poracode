import Foundation

struct ProjectNoteTodo: Codable, Equatable, Hashable, Sendable, Identifiable {
    var id: String
    var text: String
    var done: Bool
    var createdAt: String
}

struct ProjectNotes: Codable, Equatable, Hashable, Sendable {
    var projectId: String
    /// Opaque ProseMirror JSON. Nil is the wire-level JSON null value.
    var doc: JSONValue?
    /// Wire order is presentation order and must remain unchanged.
    var todos: [ProjectNoteTodo]
    var updatedAt: String
    var revision: String?

    private enum CodingKeys: String, CodingKey {
        case projectId
        case doc
        case todos
        case updatedAt
        case revision
    }

    init(projectId: String, doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String, revision: String? = nil) {
        self.projectId = projectId
        self.doc = doc
        self.todos = todos
        self.updatedAt = updatedAt
        self.revision = revision
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard values.contains(.doc) else {
            throw DecodingError.keyNotFound(
                CodingKeys.doc,
                .init(codingPath: values.codingPath, debugDescription: "Project notes require doc")
            )
        }
        projectId = try values.decode(String.self, forKey: .projectId)
        doc = try values.decodeIfPresent(JSONValue.self, forKey: .doc)
        todos = try values.decode([ProjectNoteTodo].self, forKey: .todos)
        updatedAt = try values.decode(String.self, forKey: .updatedAt)
        revision = try values.decodeIfPresent(String.self, forKey: .revision)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(projectId, forKey: .projectId)
        if let doc {
            try values.encode(doc, forKey: .doc)
        } else {
            try values.encodeNil(forKey: .doc)
        }
        try values.encode(todos, forKey: .todos)
        try values.encode(updatedAt, forKey: .updatedAt)
        try values.encodeIfPresent(revision, forKey: .revision)
    }
}

struct ProjectNotesResponse: Codable, Equatable, Sendable {
    var notes: ProjectNotes?
    var guardedWrites: Int?

    private enum CodingKeys: String, CodingKey {
        case notes
        case guardedWrites
    }

    init(notes: ProjectNotes?, guardedWrites: Int? = nil) {
        self.notes = notes
        self.guardedWrites = guardedWrites
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard values.contains(.notes) else {
            throw DecodingError.keyNotFound(
                CodingKeys.notes,
                .init(codingPath: values.codingPath, debugDescription: "Response requires notes")
            )
        }
        notes = try values.decodeIfPresent(ProjectNotes.self, forKey: .notes)
        guardedWrites = try values.decodeIfPresent(Int.self, forKey: .guardedWrites)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        if let notes {
            try values.encode(notes, forKey: .notes)
        } else {
            try values.encodeNil(forKey: .notes)
        }
        try values.encodeIfPresent(guardedWrites, forKey: .guardedWrites)
    }
}

struct ProjectNotesWriteBody: Codable, Equatable, Hashable, Sendable {
    var doc: JSONValue?
    var todos: [ProjectNoteTodo]
    var updatedAt: String
    var guarded: Bool
    var baseRevision: String?

    private enum CodingKeys: String, CodingKey {
        case doc
        case todos
        case updatedAt
        case replacement
        case baseRevision
    }

    init(doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String, guarded: Bool = false, baseRevision: String? = nil) {
        self.doc = doc
        self.todos = todos
        self.updatedAt = updatedAt
        self.guarded = guarded
        self.baseRevision = baseRevision
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        if values.contains(.replacement) {
            let replacement = try values.nestedContainer(keyedBy: CodingKeys.self, forKey: .replacement)
            doc = try replacement.decodeIfPresent(JSONValue.self, forKey: .doc)
            todos = try replacement.decode([ProjectNoteTodo].self, forKey: .todos)
            updatedAt = ""
            guarded = true
            baseRevision = try values.decodeIfPresent(String.self, forKey: .baseRevision)
            return
        }
        guard values.contains(.doc) else {
            throw DecodingError.keyNotFound(
                CodingKeys.doc,
                .init(codingPath: values.codingPath, debugDescription: "Write body requires doc")
            )
        }
        doc = try values.decodeIfPresent(JSONValue.self, forKey: .doc)
        todos = try values.decode([ProjectNoteTodo].self, forKey: .todos)
        updatedAt = try values.decode(String.self, forKey: .updatedAt)
        guarded = false
        baseRevision = nil
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        if guarded {
            var replacement = values.nestedContainer(keyedBy: CodingKeys.self, forKey: .replacement)
            try replacement.encode(doc, forKey: .doc)
            try replacement.encode(todos, forKey: .todos)
            try values.encode(baseRevision, forKey: .baseRevision)
            return
        }
        try values.encode(doc, forKey: .doc)
        try values.encode(todos, forKey: .todos)
        try values.encode(updatedAt, forKey: .updatedAt)
    }
}

struct ProjectNotesSaveResult: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case saved, conflict }
    var status: Status
    var notes: ProjectNotes?
}

struct ProjectNotesWriteResponse: Codable, Equatable, Sendable {
    var result: ProjectNotesSaveResult?
}
