import Foundation

struct GitHubWorkflowSummary: Identifiable, Equatable, Sendable {
  let id: Int64
  let name: String
  let path: String
  let state: String
}

struct GitHubWorkflowDefinition: Identifiable, Equatable, Sendable {
  let workflowId: Int64
  let ref: String
  let defaultBranch: String
  let dispatchable: Bool
  let triggers: [String]
  let inputs: [GitHubWorkflowInput]

  var id: Int64 { workflowId }
}

struct GitHubWorkflowInput: Identifiable, Equatable, Sendable {
  let name: String
  let description: String
  let required: Bool
  let type: String
  let defaultValue: GitHubJSONValue?
  let options: [String]

  var id: String { name }
}

struct GitHubWorkflowRun: Identifiable, Equatable, Sendable {
  let id: Int64
  let workflowId: Int64
  let workflowName: String
  let name: String
  let number: Int64
  let attempt: Int64
  let title: String
  let event: String
  let headBranch: String
  let headSha: String
  let status: String
  let conclusion: String
  let createdAt: String
  let startedAt: String
  let updatedAt: String
  let url: String
  let jobs: [GitHubWorkflowJob]
}

struct GitHubWorkflowJob: Identifiable, Equatable, Sendable {
  let id: Int64
  let name: String
  let status: String
  let conclusion: String
  let startedAt: String?
  let completedAt: String?
  let url: String?
  let steps: [GitHubWorkflowStep]
}

struct GitHubWorkflowStep: Identifiable, Equatable, Sendable {
  let number: Int64
  let name: String
  let status: String
  let conclusion: String
  let startedAt: String?
  let completedAt: String?

  var id: Int64 { number }
}

extension GitHubResultProjection {
  static func workflows(_ result: GitHubOperationResult) -> [GitHubWorkflowSummary]? {
    guard let values = result.document?["workflows"]?.arrayValue else { return nil }
    return values.compactMap { value in
      guard let object = value.objectValue,
        let id = object["id"]?.integerValue,
        let name = object["name"]?.stringValue,
        let path = object["path"]?.stringValue,
        let state = object["state"]?.stringValue
      else { return nil }
      return GitHubWorkflowSummary(id: id, name: name, path: path, state: state)
    }
  }

  static func workflowRuns(_ result: GitHubOperationResult) -> [GitHubWorkflowRun]? {
    guard let values = result.document?["runs"]?.arrayValue else { return nil }
    return values.compactMap(workflowRun)
  }

  static func workflowRun(_ result: GitHubOperationResult) -> GitHubWorkflowRun? {
    guard let value = result.document?["run"] else { return nil }
    return workflowRun(value)
  }

  static func workflowDefinition(_ result: GitHubOperationResult) -> GitHubWorkflowDefinition? {
    guard let object = result.document?["definition"]?.objectValue,
      let workflowId = object["workflowId"]?.integerValue,
      let ref = object["ref"]?.stringValue,
      let defaultBranch = object["defaultBranch"]?.stringValue,
      let dispatchable = object["dispatchable"]?.boolValue,
      let triggerValues = object["triggers"]?.arrayValue,
      let inputValues = object["inputs"]?.arrayValue
    else { return nil }
    return GitHubWorkflowDefinition(
      workflowId: workflowId,
      ref: ref,
      defaultBranch: defaultBranch,
      dispatchable: dispatchable,
      triggers: triggerValues.compactMap(\.stringValue),
      inputs: inputValues.compactMap(workflowInput)
    )
  }

  private static func workflowInput(_ value: GitHubJSONValue) -> GitHubWorkflowInput? {
    guard let object = value.objectValue,
      let name = object["name"]?.stringValue,
      let description = object["description"]?.stringValue,
      let required = object["required"]?.boolValue,
      let type = object["type"]?.stringValue,
      let optionValues = object["options"]?.arrayValue
    else { return nil }
    return GitHubWorkflowInput(
      name: name,
      description: description,
      required: required,
      type: type,
      defaultValue: object["defaultValue"],
      options: optionValues.compactMap(\.stringValue)
    )
  }

  private static func workflowRun(_ value: GitHubJSONValue) -> GitHubWorkflowRun? {
    guard let object = value.objectValue,
      let id = object["id"]?.integerValue,
      let workflowId = object["workflowId"]?.integerValue,
      let workflowName = object["workflowName"]?.stringValue,
      let name = object["name"]?.stringValue,
      let number = object["number"]?.integerValue,
      let attempt = object["attempt"]?.integerValue,
      let title = object["title"]?.stringValue,
      let event = object["event"]?.stringValue,
      let headBranch = object["headBranch"]?.stringValue,
      let headSha = object["headSha"]?.stringValue,
      let status = object["status"]?.stringValue,
      let conclusion = object["conclusion"]?.stringValue,
      let createdAt = object["createdAt"]?.stringValue,
      let startedAt = object["startedAt"]?.stringValue,
      let updatedAt = object["updatedAt"]?.stringValue,
      let url = object["url"]?.stringValue,
      let jobValues = object["jobs"]?.arrayValue
    else { return nil }
    return GitHubWorkflowRun(
      id: id,
      workflowId: workflowId,
      workflowName: workflowName,
      name: name,
      number: number,
      attempt: attempt,
      title: title,
      event: event,
      headBranch: headBranch,
      headSha: headSha,
      status: status,
      conclusion: conclusion,
      createdAt: createdAt,
      startedAt: startedAt,
      updatedAt: updatedAt,
      url: url,
      jobs: jobValues.compactMap(workflowJob)
    )
  }

  private static func workflowJob(_ value: GitHubJSONValue) -> GitHubWorkflowJob? {
    guard let object = value.objectValue,
      let id = object["id"]?.integerValue,
      let name = object["name"]?.stringValue,
      let status = object["status"]?.stringValue,
      let conclusion = object["conclusion"]?.stringValue,
      let stepValues = object["steps"]?.arrayValue
    else { return nil }
    return GitHubWorkflowJob(
      id: id,
      name: name,
      status: status,
      conclusion: conclusion,
      startedAt: object["startedAt"]?.stringValue,
      completedAt: object["completedAt"]?.stringValue,
      url: object["url"]?.stringValue,
      steps: stepValues.compactMap(workflowStep)
    )
  }

  private static func workflowStep(_ value: GitHubJSONValue) -> GitHubWorkflowStep? {
    guard let object = value.objectValue,
      let number = object["number"]?.integerValue,
      let name = object["name"]?.stringValue,
      let status = object["status"]?.stringValue,
      let conclusion = object["conclusion"]?.stringValue
    else { return nil }
    return GitHubWorkflowStep(
      number: number,
      name: name,
      status: status,
      conclusion: conclusion,
      startedAt: object["startedAt"]?.stringValue,
      completedAt: object["completedAt"]?.stringValue
    )
  }
}
