package com.poracode.app.protocol.advancedops

import com.poracode.app.model.PosixProjectLocation
import com.poracode.app.model.ProjectLocation
import com.poracode.app.model.WindowsProjectLocation
import com.poracode.app.model.WslProjectLocation
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Lossless wire projection: paths remain opaque and absent remote ids stay omitted. */
fun ProjectLocation.toAdvancedWireLocation(): JsonObject = buildJsonObject {
    when (val location = this@toAdvancedWireLocation) {
        is PosixProjectLocation -> {
            put("kind", "posix")
            put("path", location.path)
            location.remoteServerId?.let { put("remoteServerId", it) }
        }
        is WindowsProjectLocation -> {
            put("kind", "windows")
            put("path", location.path)
            location.remoteServerId?.let { put("remoteServerId", it) }
        }
        is WslProjectLocation -> {
            put("kind", "wsl")
            put("distro", location.distro)
            put("linuxPath", location.linuxPath)
            put("uncPath", location.uncPath)
            location.remoteServerId?.let { put("remoteServerId", it) }
        }
    }
}
