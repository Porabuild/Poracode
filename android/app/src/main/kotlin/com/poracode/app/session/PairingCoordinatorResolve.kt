package com.poracode.app.session

import com.poracode.app.protocol.PairingException
import com.poracode.app.protocol.PairingUrl

internal data class ResolvedPairing(
    val endpoint: String,
    val credential: String,
    val certFingerprint: String?,
)

internal fun resolvePairing(input: PairingCoordinator.PairingInput): ResolvedPairing {
    val pasted = input.pairingUrlOrEmpty.trim()
    if (pasted.isNotEmpty()) {
        val deep = PairingUrl.parseDeepLink(pasted)
        if (deep != null) {
            return ResolvedPairing(
                endpoint = deep.endpoint,
                credential = deep.token,
                certFingerprint = PairingUrl.parseCertFingerprint(pasted),
            )
        }
        val parts = PairingUrl.parseParts(pasted)
        if (parts != null) {
            return ResolvedPairing(
                endpoint = PairingUrl.normalizeEndpoint(pasted),
                credential = parts.token,
                certFingerprint = parts.certFingerprint,
            )
        }
        if (input.manualToken.trim().isNotEmpty()) {
            return ResolvedPairing(
                endpoint = PairingUrl.normalizeEndpoint(pasted),
                credential = input.manualToken.trim(),
                certFingerprint = PairingUrl.parseCertFingerprint(pasted),
            )
        }
        throw PairingException.MissingToken
    }
    val base = input.manualBaseUrl.trim()
    val token = input.manualToken.trim()
    if (base.isEmpty()) throw PairingException.InvalidUrl
    if (token.isEmpty()) throw PairingException.MissingToken
    return ResolvedPairing(
        endpoint = PairingUrl.normalizeEndpoint(base),
        credential = token,
        certFingerprint = PairingUrl.parseCertFingerprint(base),
    )
}
