// GENERATED FILE. Do not edit by hand. Run `pnpm protocol:remote:v3:generate`.
// Follow-up queue reduce machine rendered from the declarative spec in
// src/shared/remote/contract/followUpQueueMachineSpec.ts (spec version 1).
package com.poracode.remote.v3.generated

enum class RemoteFollowUpQueueReduceAction { Ignore, Replace, Clear }

object RemoteFollowUpQueueReduce {
    fun action(
        sameThread: Boolean,
        queueKeyPresent: Boolean,
        queueIsNull: Boolean,
    ): RemoteFollowUpQueueReduceAction {
        if (!sameThread && queueKeyPresent) return RemoteFollowUpQueueReduceAction.Ignore
        if (!sameThread && !queueKeyPresent) return RemoteFollowUpQueueReduceAction.Ignore
        if (sameThread && !queueKeyPresent) return RemoteFollowUpQueueReduceAction.Ignore
        if (sameThread && queueKeyPresent && queueIsNull) return RemoteFollowUpQueueReduceAction.Clear
        if (sameThread && queueKeyPresent) return RemoteFollowUpQueueReduceAction.Replace
        return RemoteFollowUpQueueReduceAction.Ignore
    }
}
