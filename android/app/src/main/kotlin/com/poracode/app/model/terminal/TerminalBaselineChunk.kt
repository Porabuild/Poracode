package com.poracode.app.model.terminal

/**
 * One ordered slice of a cursor-sync v2 chunked baseline. The final chunk
 * (`chunkIndex == chunkCount - 1`) completes the baseline — there is no
 * separate completion frame. Ranges are contiguous JS UTF-16 code units:
 * `toCursor - fromCursor == data.length` and chunk `k+1.from == chunk k.to`.
 */
data class TerminalBaselineChunk(
    val terminalId: String,
    val watchId: String,
    /** Null = replace-only window (SQLite fallback), still chunked. */
    val generation: String?,
    val chunkIndex: Int,
    val chunkCount: Int,
    val fromCursor: Long,
    val toCursor: Long,
    val data: String,
    val processState: TerminalProcessState,
    val dimensions: TerminalDimensions?,
    /** True = delta from the client's resume cursor; false = full window. */
    val resumeServed: Boolean,
) {
    init {
        require(terminalId.isNotEmpty()) { "terminalId must not be empty" }
        require(watchId.isNotEmpty()) { "watchId must not be empty" }
        require(chunkIndex >= 0) { "chunkIndex must be non-negative" }
        require(chunkCount > 0) { "chunkCount must be positive" }
        require(chunkIndex < chunkCount) { "chunkIndex must be < chunkCount" }
        require(fromCursor >= 0L) { "fromCursor must be non-negative" }
        require(toCursor >= fromCursor) { "toCursor must be >= fromCursor" }
        require(toCursor - fromCursor == data.length.toLong()) {
            "toCursor - fromCursor must equal data length"
        }
    }
}
