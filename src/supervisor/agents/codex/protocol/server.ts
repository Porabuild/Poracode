import type {
  ApplyPatchApprovalParams,
  ApplyPatchApprovalResponse,
  ChatgptAuthTokensRefreshParams,
  ChatgptAuthTokensRefreshResponse,
  CommandExecutionApprovalDecision,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  CurrentTimeReadParams,
  CurrentTimeReadResponse,
  ExecCommandApprovalParams,
  ExecCommandApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
} from "@poracode/codex-protocol";

export type {
  ApplyPatchApprovalParams,
  ApplyPatchApprovalResponse,
  ChatgptAuthTokensRefreshParams,
  ChatgptAuthTokensRefreshResponse,
  CommandExecutionApprovalDecision,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  CurrentTimeReadParams,
  CurrentTimeReadResponse,
  ExecCommandApprovalParams,
  ExecCommandApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  PermissionsRequestApprovalParams,
  PermissionsRequestApprovalResponse,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
};

export interface CodexServerRequestMap {
  "item/commandExecution/requestApproval": {
    params: CommandExecutionRequestApprovalParams;
    result: CommandExecutionRequestApprovalResponse;
  };
  "item/fileChange/requestApproval": {
    params: FileChangeRequestApprovalParams;
    result: FileChangeRequestApprovalResponse;
  };
  "item/permissions/requestApproval": {
    params: PermissionsRequestApprovalParams;
    result: PermissionsRequestApprovalResponse;
  };
  "item/tool/requestUserInput": {
    params: ToolRequestUserInputParams;
    result: ToolRequestUserInputResponse;
  };
  "mcpServer/elicitation/request": {
    params: McpServerElicitationRequestParams;
    result: McpServerElicitationRequestResponse;
  };
  "currentTime/read": { params: CurrentTimeReadParams; result: CurrentTimeReadResponse };
  "account/chatgptAuthTokens/refresh": {
    params: ChatgptAuthTokensRefreshParams;
    result: ChatgptAuthTokensRefreshResponse;
  };
  applyPatchApproval: {
    params: ApplyPatchApprovalParams;
    result: ApplyPatchApprovalResponse;
  };
  execCommandApproval: {
    params: ExecCommandApprovalParams;
    result: ExecCommandApprovalResponse;
  };
}
