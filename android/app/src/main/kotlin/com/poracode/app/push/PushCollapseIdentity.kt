package com.poracode.app.push

import java.security.MessageDigest
import java.util.Base64

object PushCollapseIdentity {
    const val MAX_BYTES = 32

    fun routed(route: PushRouteV1): String {
        val digest = MessageDigest.getInstance("SHA-256")
        add(digest, "routed-v1")
        add(digest, route.clientConnectionId)
        add(digest, route.desktopId)
        add(digest, requireNotNull(route.threadId))
        val encoded = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(digest.digest().copyOfRange(0, 20))
        return "pc1.$encoded"
    }

    private fun add(digest: MessageDigest, value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        digest.update(bytes.size.toString().toByteArray(Charsets.UTF_8))
        digest.update(':'.code.toByte())
        digest.update(bytes)
        digest.update(';'.code.toByte())
    }
}
