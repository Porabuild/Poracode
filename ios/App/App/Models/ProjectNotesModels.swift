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

    private enum CodingKeys: String, CodingKey {
        case projectId
        case doc
        case todos
        case updatedAt
    }

    init(projectId: String, doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String) {
        self.projectId = projectId
        self.doc = doc
        self.todos = todos
        self.updatedAt = updatedAt
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
    }
}

struct ProjectNotesResponse: Codable, Equatable, Sendable {
    var notes: ProjectNotes?

    private enum CodingKeys: String, CodingKey {
        case notes
    }

    init(notes: ProjectNotes?) {
        self.notes = notes
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
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        if let notes {
            try values.encode(notes, forKey: .notes)
        } else {
            try values.encodeNil(forKey: .notes)
        }
    }
}

struct ProjectNotesWriteBody: Codable, Equatable, Hashable, Sendable {
    var doc: JSONValue?
    var todos: [ProjectNoteTodo]
    var updatedAt: String

    private enum CodingKeys: String, CodingKey {
        case doc
        case todos
        case updatedAt
    }

    init(doc: JSONValue?, todos: [ProjectNoteTodo], updatedAt: String) {
        self.doc = doc
        self.todos = todos
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard values.contains(.doc) else {
            throw DecodingError.keyNotFound(
                CodingKeys.doc,
                .init(codingPath: values.codingPath, debugDescription: "Write body requires doc")
            )
        }
        doc = try values.decodeIfPresent(JSONValue.self, forKey: .doc)
        todos = try values.decode([ProjectNoteTodo].self, forKey: .todos)
        updatedAt = try values.decode(String.self, forKey: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        if let doc {
            try values.encode(doc, forKey: .doc)
        } else {
            try values.encodeNil(forKey: .doc)
        }
        try values.encode(todos, forKey: .todos)
        try values.encode(updatedAt, forKey: .updatedAt)
    }
}
