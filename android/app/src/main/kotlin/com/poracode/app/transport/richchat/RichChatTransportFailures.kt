package com.poracode.app.transport.richchat

import kotlinx.coroutines.CancellationException

sealed class RichChatTransportException(message: String) : Exception(message)

class RichChatInvalidRequestException(message: String) : RichChatTransportException(message)

class RichChatAuthorizationException(val status: Int) :
    RichChatTransportException("Remote authorization failed.")

class RichChatRemoteRejectedException(val status: Int) :
    RichChatTransportException("The remote host rejected the request.")

class RichChatMutationOutcomeUnknownException(val operation: String) :
    RichChatTransportException("The remote mutation outcome is unknown.")

class RichChatTransportUnavailableException :
    RichChatTransportException("The remote host could not be reached.")

class RichChatInvalidResponseException :
    RichChatTransportException("The remote host returned an invalid response.")

class RichChatMutationCancelledException(val operation: String) :
    CancellationException("The remote mutation was cancelled; its outcome may be unknown.")

class RichChatRequestCancelledException(val operation: String) :
    CancellationException("The remote request was cancelled.")

class RichChatRawTransportUnavailableException :
    RichChatTransportException("A raw binary transport is required for this operation.")
