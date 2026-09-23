package com.poracode.app.session.richchat

/** Identity of one terminal operation: the slot it owns and the generation it published under. */
internal data class TerminalOperationToken(
    val host: RichChatHostKey,
    val terminalId: String,
    val generation: Long,
    val kind: String,
    val epoch: Long,
)

/**
 * Latest operation of each kind owns publication and the busy flag. A token may
 * only clear/publish its kind's activeOperations entry while its epoch is still the
 * current one; a newer operation of the same kind (or a bump, which clears the map)
 * takes ownership, so an abandoned operation can never strand or steal the slot.
 */
internal class RichTerminalOperationEpochs {
    private var epoch = 0L
    private val currentByKind = mutableMapOf<String, Long>()

    @Synchronized
    fun next(kind: String): Long {
        epoch += 1L
        currentByKind[kind] = epoch
        return epoch
    }

    @Synchronized
    fun holds(kind: String, value: Long): Boolean = currentByKind[kind] == value

    @Synchronized
    fun bumpAll() {
        epoch += 1L
        currentByKind.clear()
    }
}
