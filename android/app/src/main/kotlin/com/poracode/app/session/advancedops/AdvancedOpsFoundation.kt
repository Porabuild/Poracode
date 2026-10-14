package com.poracode.app.session.advancedops

import com.poracode.app.transport.ForegroundNetworkGate
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.advancedops.RemoteAdvancedOpsTransport
import com.poracode.app.transport.advancedops.AdvancedOpsTransport
import kotlinx.coroutines.flow.StateFlow
import okhttp3.OkHttpClient

/**
 * Later integration entry point. This isolated foundation is intentionally unreachable until an
 * app composition root supplies the live owner snapshot and retains this object.
 */
class AdvancedOpsFoundation private constructor(
    val checkpointSubagentInput: CheckpointSubagentInputController,
    val workflow: WorkflowController,
    val externalProjectFiles: ExternalProjectFilesController,
    val generationHelpers: GenerationHelpersController,
) {
    fun close() {
        checkpointSubagentInput.close()
        workflow.close()
        externalProjectFiles.close()
        generationHelpers.close()
    }

    companion object {
        fun create(
            owners: StateFlow<AdvancedOwnerSnapshot>,
            endpoint: String,
            accessToken: String,
            client: OkHttpClient = RemoteApiClient.defaultClient(),
            networkGate: ForegroundNetworkGate = ForegroundNetworkGate.shared,
        ): AdvancedOpsFoundation {
            val transport = RemoteAdvancedOpsTransport(
                endpoint,
                accessToken,
                client,
                networkGate,
            )
            return create(owners, transport)
        }

        fun create(
            owners: StateFlow<AdvancedOwnerSnapshot>,
            transport: AdvancedOpsTransport,
        ): AdvancedOpsFoundation {
            val gateway = GeneratedAdvancedOpsGateway(owners, transport)
            return AdvancedOpsFoundation(
                CheckpointSubagentInputController(gateway),
                WorkflowController(gateway),
                ExternalProjectFilesController(gateway),
                GenerationHelpersController(gateway),
            )
        }
    }
}
