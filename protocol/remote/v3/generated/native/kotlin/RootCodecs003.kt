// GENERATED FILE. Do not edit by hand.
package com.poracode.remote.v3.generated

import kotlinx.serialization.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*
import kotlinx.serialization.json.*
val RemoteRootCodecs.routeU2ETokenU2DExchangeU2EResponse: RemoteRootCodec<RoutetokenU2DExchangeResponse_d15a69227c>
    get() = RemoteRootCodec("route.token-exchange.response", serializer<RoutetokenU2DExchangeResponse_d15a69227c>(), schema_d15a69227c93754c)

val RemoteRootCodecs.routeU2EWebsocketU2DTicketU2EResponse: RemoteRootCodec<RoutewebsocketU2DTicketResponse_b9dfb5a053>
    get() = RemoteRootCodec("route.websocket-ticket.response", serializer<RoutewebsocketU2DTicketResponse_b9dfb5a053>(), schema_b9dfb5a053707da9)

val RemoteRootCodecs.websocketU2EClient: RemoteRootCodec<WebSocketClientMessage_872dc7baba>
    get() = RemoteRootCodec("websocket.client", serializer<WebSocketClientMessage_872dc7baba>(), schema_872dc7babad00cd3)

val RemoteRootCodecs.websocketU2EClientU2EBrowserU2DInput: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D4_d550ef9994>
    get() = RemoteRootCodec("websocket.client.browser-input", serializer<WebSocketClientMessageU2DOptionU2D4_d550ef9994>(), schema_d550ef9994fd388f)

val RemoteRootCodecs.websocketU2EClientU2EBrowserU2DUnwatch: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>
    get() = RemoteRootCodec("websocket.client.browser-unwatch", serializer<WebSocketClientMessageU2DOptionU2D3_0e8f58f429>(), schema_0e8f58f429bb1135)

val RemoteRootCodecs.websocketU2EClientU2EBrowserU2DWatch: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>
    get() = RemoteRootCodec("websocket.client.browser-watch", serializer<WebSocketClientMessageU2DOptionU2D2_2b7b34c95b>(), schema_2b7b34c95b23bb0d)

val RemoteRootCodecs.websocketU2EClientU2EGitU2DStateU2DInterests: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D8_d2299af726>
    get() = RemoteRootCodec("websocket.client.git-state-interests", serializer<WebSocketClientMessageU2DOptionU2D8_d2299af726>(), schema_d2299af726097d6c)

val RemoteRootCodecs.websocketU2EClientU2EPing: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D1_1709690cf0>
    get() = RemoteRootCodec("websocket.client.ping", serializer<WebSocketClientMessageU2DOptionU2D1_1709690cf0>(), schema_1709690cf0edf961)

val RemoteRootCodecs.websocketU2EClientU2ETerminalU2DUnwatch: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>
    get() = RemoteRootCodec("websocket.client.terminal-unwatch", serializer<WebSocketClientMessageU2DOptionU2D6_5af10e67b4>(), schema_5af10e67b405a136)

val RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatch: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D5_838adcbcaf>
    get() = RemoteRootCodec("websocket.client.terminal-watch", serializer<WebSocketClientMessageU2DOptionU2D5_838adcbcaf>(), schema_838adcbcaff5f551)

val RemoteRootCodecs.websocketU2EClientU2ETerminalU2DWatchU2DBaselineU2DAck: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D7_3f58316dbb>
    get() = RemoteRootCodec("websocket.client.terminal-watch-baseline-ack", serializer<WebSocketClientMessageU2DOptionU2D7_3f58316dbb>(), schema_3f58316dbb160752)

val RemoteRootCodecs.websocketU2EClientU2EThreadU2DItemU2DInterests: RemoteRootCodec<WebSocketClientMessageU2DOptionU2D9_93bef3a552>
    get() = RemoteRootCodec("websocket.client.thread-item-interests", serializer<WebSocketClientMessageU2DOptionU2D9_93bef3a552>(), schema_93bef3a552bf787e)

val RemoteRootCodecs.websocketU2EServer: RemoteRootCodec<WebSocketServerMessage_e9a499aee9>
    get() = RemoteRootCodec("websocket.server", serializer<WebSocketServerMessage_e9a499aee9>(), schema_e9a499aee9cc5592)

val RemoteRootCodecs.websocketU2EServerU2EBrowserU2DFrame: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>
    get() = RemoteRootCodec("websocket.server.browser-frame", serializer<WebSocketServerMessageU2DOptionU2D6_8f58c1d1ac>(), schema_8f58c1d1acd8bc3c)

val RemoteRootCodecs.websocketU2EServerU2EBrowserU2DMirrorU2DStatus: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>
    get() = RemoteRootCodec("websocket.server.browser-mirror-status", serializer<WebSocketServerMessageU2DOptionU2D7_0ad133ee58>(), schema_0ad133ee5894107b)

val RemoteRootCodecs.websocketU2EServerU2EBrowserU2DState: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>
    get() = RemoteRootCodec("websocket.server.browser-state", serializer<WebSocketServerMessageU2DOptionU2D5_bd23acb1d6>(), schema_bd23acb1d60bc91b)

val RemoteRootCodecs.websocketU2EServerU2EEvent: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D2_8f72d27346>
    get() = RemoteRootCodec("websocket.server.event", serializer<WebSocketServerMessageU2DOptionU2D2_8f72d27346>(), schema_8f72d273465cb93f)

val RemoteRootCodecs.websocketU2EServerU2EPong: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>
    get() = RemoteRootCodec("websocket.server.pong", serializer<WebSocketServerMessageU2DOptionU2D4_17b50a5a25>(), schema_17b50a5a251b31ce)

val RemoteRootCodecs.websocketU2EServerU2EReady: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D1_13762c62f0>
    get() = RemoteRootCodec("websocket.server.ready", serializer<WebSocketServerMessageU2DOptionU2D1_13762c62f0>(), schema_13762c62f0c23527)

val RemoteRootCodecs.websocketU2EServerU2EResyncU2DRequired: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D3_67185a3945>
    get() = RemoteRootCodec("websocket.server.resync-required", serializer<WebSocketServerMessageU2DOptionU2D3_67185a3945>(), schema_67185a39458481f6)

val RemoteRootCodecs.websocketU2EServerU2ETerminalU2DOutput: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>
    get() = RemoteRootCodec("websocket.server.terminal-output", serializer<WebSocketServerMessageU2DOptionU2D8_95d0adeb5b>(), schema_95d0adeb5b1f4c44)

val RemoteRootCodecs.websocketU2EServerU2ETerminalU2DWatchU2DBaselineU2DChunk: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D10_e65689e97e>
    get() = RemoteRootCodec("websocket.server.terminal-watch-baseline-chunk", serializer<WebSocketServerMessageU2DOptionU2D10_e65689e97e>(), schema_e65689e97e7d91c3)

val RemoteRootCodecs.websocketU2EServerU2ETerminalU2DWatchU2DResult: RemoteRootCodec<WebSocketServerMessageU2DOptionU2D9_4655073d71>
    get() = RemoteRootCodec("websocket.server.terminal-watch-result", serializer<WebSocketServerMessageU2DOptionU2D9_4655073d71>(), schema_4655073d71f8e50b)
