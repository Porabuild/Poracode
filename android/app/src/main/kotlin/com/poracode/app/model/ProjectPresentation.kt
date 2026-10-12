package com.poracode.app.model

/** Path suited to a person working inside the selected runtime. */
fun ProjectLocation.displayPath(): String = when (this) {
    is PosixProjectLocation -> path
    is WindowsProjectLocation -> path
    is WslProjectLocation -> linuxPath
}

/** Path the Windows host can use to reach the selected runtime. */
fun ProjectLocation.hostPath(): String = when (this) {
    is PosixProjectLocation -> path
    is WindowsProjectLocation -> path
    is WslProjectLocation -> uncPath
}
