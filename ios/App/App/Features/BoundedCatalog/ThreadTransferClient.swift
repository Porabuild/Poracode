import Foundation
import SwiftUI

// MARK: - Cross-Host Thread Transfer (`thread-transfer-command` & `thread-transfer-upload`)

struct ThreadTransferTargetHost: Identifiable, Equatable, Sendable {
  let id: String
  let label: String
  let projects: [(id: String, name: String)]

  static func == (lhs: ThreadTransferTargetHost, rhs: ThreadTransferTargetHost) -> Bool {
    lhs.id == rhs.id && lhs.label == rhs.label && lhs.projects.map(\.id) == rhs.projects.map(\.id)
  }
}

enum ThreadTransferWire {
  static let commandRouteId = "thread-transfer-command"
  static let uploadRouteId = "thread-transfer-upload"
  static let commandPath = "/api/threads/transfer/command"
  static let uploadPath = "/api/threads/transfer/upload"

  static func exportThread(threadId: String, sourceAPI: RemoteAPIClient) async throws -> Data {
    let payload: [String: Any] = ["kind": "export", "threadId": threadId]
    let body = try JSONSerialization.data(withJSONObject: payload)
    return try await sourceAPI.requestData(path: commandPath, method: "POST", jsonBody: body)
  }

  static func uploadBundle(
    transferId: String,
    bundle: Data,
    destinationAPI: RemoteAPIClient
  ) async throws -> Data {
    try await destinationAPI.requestData(
      path: uploadPath,
      method: "PUT",
      queryItems: [URLQueryItem(name: "transferId", value: transferId)],
      jsonBody: bundle
    )
  }

  static func commitImport(
    transferId: String,
    targetProjectId: String,
    destinationAPI: RemoteAPIClient
  ) async throws -> Data {
    let payload: [String: Any] = [
      "kind": "commit",
      "transferId": transferId,
      "projectId": targetProjectId,
    ]
    let body = try JSONSerialization.data(withJSONObject: payload)
    return try await destinationAPI.requestData(path: commandPath, method: "POST", jsonBody: body)
  }
}

struct ThreadTransferSheet: View {
  let threadTitle: String
  let destinations: [ThreadTransferTargetHost]
  let onTransfer: (String, String) async -> String?
  @Environment(\.dismiss) private var dismiss
  @State private var selectedHostId = ""
  @State private var selectedProjectId = ""
  @State private var busy = false
  @State private var errorMessage: String?

  private var selectedHost: ThreadTransferTargetHost? {
    destinations.first(where: { $0.id == selectedHostId }) ?? destinations.first
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Target host") {
          Picker("Host", selection: $selectedHostId) {
            ForEach(destinations) { host in
              Text(host.label).tag(host.id)
            }
          }
          if let host = selectedHost {
            Picker("Project", selection: $selectedProjectId) {
              ForEach(host.projects, id: \.id) { project in
                Text(project.name).tag(project.id)
              }
            }
          }
        }
        if let errorMessage {
          Section { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
        }
      }
      .navigationTitle("Move \(threadTitle)")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }.disabled(busy)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Move") {
            guard let host = selectedHost,
              let projId = host.projects.first(where: { $0.id == selectedProjectId })?.id ?? host.projects.first?.id
            else { return }
            busy = true
            errorMessage = nil
            Task {
              if let err = await onTransfer(host.id, projId) {
                errorMessage = err
                busy = false
              } else {
                dismiss()
              }
            }
          }
          .disabled(busy || selectedHost == nil)
        }
      }
      .onAppear {
        if selectedHostId.isEmpty, let first = destinations.first {
          selectedHostId = first.id
          selectedProjectId = first.projects.first?.id ?? ""
        }
      }
    }
  }
}

// MARK: - Catalog Mutations v1 (Relative Thread Reorder & Nullable Workspace)

enum CatalogMutationsV1 {
  static func reorderThreadPayload(
    threadId: String,
    beforeThreadId: String? = nil,
    afterThreadId: String? = nil
  ) -> [String: Any] {
    var payload: [String: Any] = ["kind": "reorder", "threadId": threadId]
    if let beforeThreadId { payload["beforeThreadId"] = beforeThreadId }
    if let afterThreadId { payload["afterThreadId"] = afterThreadId }
    return payload
  }

  static func setProjectWorkspacePayload(projectId: String, workspaceId: String?) -> [String: Any] {
    let wsValue: Any = workspaceId ?? NSNull()
    return [
      "kind": "update",
      "projectId": projectId,
      "patch": ["workspaceId": wsValue],
    ]
  }

  static func reorderThread(
    threadId: String,
    beforeThreadId: String? = nil,
    afterThreadId: String? = nil,
    api: RemoteAPIClient
  ) async throws {
    let body = try JSONSerialization.data(
      withJSONObject: reorderThreadPayload(
        threadId: threadId,
        beforeThreadId: beforeThreadId,
        afterThreadId: afterThreadId
      )
    )
    _ = try await api.requestData(path: "/api/threads/command", method: "POST", jsonBody: body)
  }

  static func setProjectWorkspace(
    projectId: String,
    workspaceId: String?,
    api: RemoteAPIClient
  ) async throws {
    let body = try JSONSerialization.data(
      withJSONObject: setProjectWorkspacePayload(projectId: projectId, workspaceId: workspaceId)
    )
    _ = try await api.requestData(path: "/api/projects/command", method: "POST", jsonBody: body)
  }
}
