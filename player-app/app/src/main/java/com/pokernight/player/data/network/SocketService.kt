package com.pokernight.player.data.network

import android.util.Log
import com.pokernight.player.data.model.Card
import com.pokernight.player.data.model.GameState
import com.pokernight.player.data.model.SeatInfo
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import kotlin.concurrent.thread

class SocketService(
    private val onStateUpdate: (GameState) -> Unit,
    private val onEvent: (String, JSONObject) -> Unit,
) {

    companion object {
        private const val TAG = "SocketService"
        private const val WS_URL = "wss://pokernight.cc/socket.io"

        // Engine.IO v4 message types
        private const val EIO_OPEN = '0'
        private const val EIO_CLOSE = '1'
        private const val EIO_PING = '2'
        private const val EIO_MESSAGE = '4'

        // Socket.IO v4 message types
        private const val SIO_CONNECT = '0'
        private const val SIO_DISCONNECT = '1'
        private const val SIO_EVENT = '2'
        private const val SIO_ERROR = '4'

        const val EVT_TOURNAMENT_ACTIVATED = "tournament_activated"
        const val EVT_COUNTDOWN_TICK = "countdown_tick"
        const val EVT_TOURNAMENT_STARTED = "tournament_started"
        const val EVT_NEW_HAND = "new_hand"
        const val EVT_HOLE_CARDS = "hole_cards"
        const val EVT_HAND_STARTED = "hand_started"
        const val EVT_STAGE_CHANGED = "stage_changed"
        const val EVT_TURN_CHANGED = "turn_changed"
        const val EVT_ACTION_RESULT = "action_result"
        const val EVT_SHOWDOWN = "showdown"
        const val EVT_HAND_RESULT = "hand_result"
        const val EVT_PLAYER_ELIMINATED = "player_eliminated"
        const val EVT_TOURNAMENT_FINISHED = "tournament_finished"
        const val EVT_BLIND_LEVEL_UP = "blind_level_up"
    }

    private var wsClient: WebSocketClient? = null
    private var connected = false
    private var shouldReconnect = false
    private var reconnectThread: Thread? = null
    private var currentState = GameState()

    fun connect(token: String?) {
        Log.i(TAG, "connect() called, token=${if (token != null) token.take(20) + "..." else "null"}")
        if (wsClient?.isOpen == true) {
            Log.i(TAG, "Socket already connected, skipping")
            return
        }
        shouldReconnect = true
        doConnect(token)
    }

    @Suppress("UNUSED_PARAMETER") // token carried in auth; Socket.IO handshake handled by server
    private fun doConnect(token: String?) {
        try {
            wsClient?.close()
            wsClient = null
            connected = false

            Log.i(TAG, "Connecting to WebSocket: $WS_URL")

            wsClient = object : WebSocketClient(URI(WS_URL)) {
                override fun onOpen(handshake: ServerHandshake?) {
                    Log.i(TAG, "onOpen — waiting for Engine.IO open")
                    // Engine.IO handshake will come as "0{...}"
                    // Token will be sent in join_table after connected
                }

                override fun onMessage(msg: String?) {
                    if (msg.isNullOrEmpty()) return
                    Log.i(TAG, "RAW[${msg.take(200)}]")
                    handleEngineIOMessage(msg, token)
                }

                override fun onClose(code: Int, reason: String?, remote: Boolean) {
                    Log.i(TAG, "onClose: $code $reason remote=$remote")
                    handleDisconnect()
                }

                override fun onError(ex: Exception?) {
                    Log.e(TAG, "onError: ${ex?.message}", ex)
                }
            }

            wsClient?.connectionLostTimeout = 0
            wsClient?.connect()

        } catch (e: Exception) {
            Log.e(TAG, "Connection error", e)
            handleDisconnect()
        }
    }

    @Suppress("UNUSED_PARAMETER")
    private fun handleEngineIOMessage(text: String, token: String?) {
        if (text.isEmpty()) return
        when (text[0]) {
            EIO_OPEN -> {
                try {
                    val sid = JSONObject(text.substring(1)).optString("sid", "?")
                    Log.i(TAG, "Engine.IO open sid=$sid")
                    // Respond with Socket.IO connect packet (40)
                    wsClient?.send("40")
                    Log.i(TAG, "Sent 40")
                } catch (e: Exception) {
                    Log.e(TAG, "Bad open: $text", e)
                }
            }
            EIO_CLOSE -> {
                Log.i(TAG, "Engine.IO close")
                wsClient?.close()
                handleDisconnect()
            }
            EIO_PING -> {
                wsClient?.send("3")
            }
            EIO_MESSAGE -> handleSocketIOMessage(text)
            else -> Log.w(TAG, "Unknown EIO: '${text[0]}'")
        }
    }

    private fun handleSocketIOMessage(text: String) {
        if (text.length < 2) return
        when (text[1]) {
            SIO_CONNECT -> {
                Log.i(TAG, "SIO CONNECT (40)")
                if (!connected) {
                    connected = true
                    // Re-join table after connection established
                    if (currentState.tableCode.isNotEmpty()) {
                        Log.i(TAG, "Re-emitting join_table for ${currentState.tableCode}")
                        val data = JSONObject().apply { put("tableCode", currentState.tableCode) }
                        sendEvent("join_table", data)
                    }
                }
            }
            SIO_EVENT -> {
                try {
                    val arr = JSONArray(text.substring(2))
                    val name = arr.optString(0, "")
                    if (name.isEmpty()) return
                    val data = if (arr.length() > 1 && arr.opt(1) is JSONObject) {
                        arr.getJSONObject(1)
                    } else {
                        JSONObject()
                    }
                    Log.d(TAG, "Event: $name")
                    handleEvent(name, data)
                } catch (e: Exception) {
                    Log.e(TAG, "Bad event: ${text.substring(2)}", e)
                }
            }
            SIO_DISCONNECT -> {
                Log.i(TAG, "SIO DISCONNECT")
                handleDisconnect()
            }
            SIO_ERROR -> Log.e(TAG, "SIO ERROR: ${text.substring(2)}")
            else -> Log.d(TAG, "SIO type '${text[1]}': ${text.substring(2)}")
        }
    }

    private fun sendEvent(name: String, data: JSONObject) {
        val arr = JSONArray().apply { put(name); put(data) }
        wsClient?.send("42$arr")
        Log.d(TAG, "Emitted: $name")
    }

    fun disconnect() {
        Log.i(TAG, "Disconnecting")
        shouldReconnect = false
        reconnectThread?.interrupt()
        reconnectThread = null
        wsClient?.close()
        wsClient = null
        connected = false
        currentState = GameState()
    }

    fun isConnected(): Boolean = connected && wsClient?.isOpen == true

    private fun handleDisconnect() {
        val wasConnected = connected
        connected = false
        wsClient = null
        if (wasConnected) {
            onEvent("socket_disconnected", JSONObject())
        }
        if (shouldReconnect) scheduleReconnect()
    }

    private fun scheduleReconnect() {
        reconnectThread?.interrupt()
        reconnectThread = thread {
            try {
                val delay = 1000L + (Math.random() * 4000).toLong()
                Log.i(TAG, "Reconnect in ${delay}ms")
                Thread.sleep(delay)
                if (shouldReconnect) doConnect(null)
            } catch (_: InterruptedException) {}
        }
    }

    fun joinTable(tableCode: String) {
        Log.i(TAG, "joinTable($tableCode) called, connected=$connected")
        val data = JSONObject().apply { put("tableCode", tableCode) }
        if (connected && wsClient?.isOpen == true) {
            sendEvent("join_table", data)
        }
        currentState = currentState.copy(tableCode = tableCode)
    }

    fun playerAction(tournamentId: String, action: String, amount: Int = 0) {
        val data = JSONObject().apply {
            put("tournamentId", tournamentId)
            put("action", action)
            put("amount", amount)
        }
        sendEvent("player_action", data)
    }

    private fun parseSeats(jsonArr: JSONArray?): List<SeatInfo> {
        if (jsonArr == null) return emptyList()
        val seats = mutableListOf<SeatInfo>()
        for (i in 0 until jsonArr.length()) {
            val s = jsonArr.getJSONObject(i)
            seats.add(SeatInfo(
                seatIndex = s.optInt("seatIndex", i),
                playerId = s.optString("playerId", ""),
                nickname = s.optString("nickname", s.optString("name", "")),
                chipCount = s.optInt("chipCount", s.optInt("chips", 0)),
                currentBet = s.optInt("currentBet", 0),
                status = s.optString("status", "empty"),
                isDealer = s.optBoolean("isDealer", false),
                isActing = s.optBoolean("isActing", false),
                lastAction = s.optString("lastAction", ""),
            ))
        }
        return seats
    }

    private fun findMySeat(seats: List<SeatInfo>): SeatInfo? {
        val myId = AuthManager.getPlayerId()
        return seats.find { it.playerId == myId }
    }

    private fun handleEvent(name: String, data: JSONObject) {
        when (name) {
            EVT_TOURNAMENT_ACTIVATED -> {
                onEvent(name, data)
            }

            EVT_COUNTDOWN_TICK -> {
                val remaining = data.optInt("remaining", 0)
                currentState = currentState.copy(countdown = remaining)
                onStateUpdate(currentState)
            }

            "table_state" -> {
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                currentState = currentState.copy(
                    phase = data.optString("phase", ""),
                    tournamentId = data.optString("tournamentId", ""),
                    sb = data.optInt("sb", 10),
                    bb = data.optInt("bb", 20),
                    pot = data.optInt("pot", 0),
                    currentBet = data.optInt("currentBet", 0),
                    blindLevel = data.optInt("blindLevel", 1),
                    handNumber = data.optInt("handNumber", 0),
                    actingIndex = data.optInt("actingIndex", -1),
                    dealerIndex = data.optInt("dealerIndex", 0),
                    seats = if (seats.isNotEmpty()) seats else currentState.seats,
                    mySeatIndex = mySeat?.seatIndex ?: currentState.mySeatIndex,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = mySeat?.currentBet ?: 0,
                )
                onStateUpdate(currentState)
            }

            "seat_joined" -> {
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                if (seats.isNotEmpty()) {
                    currentState = currentState.copy(
                        seats = seats,
                        mySeatIndex = mySeat?.seatIndex ?: currentState.mySeatIndex,
                        myChips = mySeat?.chipCount ?: currentState.myChips,
                    )
                    onStateUpdate(currentState)
                }
            }

            EVT_TOURNAMENT_STARTED -> {
                val tid = data.optString("tournamentId", "")
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                currentState = currentState.copy(
                    phase = "tournament_started",
                    tournamentId = tid,
                    seats = seats,
                    mySeatIndex = mySeat?.seatIndex ?: currentState.mySeatIndex,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_NEW_HAND -> {
                currentState = currentState.copy(
                    phase = "new_hand",
                    communityCards = emptyList(),
                    currentBet = 0,
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_HOLE_CARDS -> {
                val cardPlayerId = data.optString("playerId", "")
                val myPlayerId = AuthManager.getPlayerId()
                if (cardPlayerId.isEmpty() || cardPlayerId == myPlayerId) {
                    val cardsArr = data.optJSONArray("cards") ?: JSONArray()
                    val cards = mutableListOf<Card>()
                    for (i in 0 until cardsArr.length()) {
                        val c = cardsArr.getJSONObject(i)
                        cards.add(Card(
                            suit = c.optString("suit", ""),
                            rank = c.optString("rank", ""),
                            value = c.optInt("value", 0),
                        ))
                    }
                    currentState = currentState.copy(holeCards = cards)
                    onStateUpdate(currentState)
                }
            }

            EVT_HAND_STARTED -> {
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                currentState = currentState.copy(
                    phase = "hand_started",
                    handNumber = data.optInt("handNumber", 0),
                    pot = data.optInt("pot", 0),
                    currentBet = data.optInt("currentBet", 0),
                    actingIndex = data.optInt("actingIndex", -1),
                    seats = seats,
                    mySeatIndex = mySeat?.seatIndex ?: currentState.mySeatIndex,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = mySeat?.currentBet ?: 0,
                    isMyTurn = data.optInt("actingIndex", -1) == (mySeat?.seatIndex ?: currentState.mySeatIndex),
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_STAGE_CHANGED -> {
                val cardsArr = data.optJSONArray("communityCards") ?: JSONArray()
                val cards = mutableListOf<Card>()
                for (i in 0 until cardsArr.length()) {
                    val c = cardsArr.getJSONObject(i)
                    cards.add(Card(
                        suit = c.optString("suit", ""),
                        rank = c.optString("rank", ""),
                        value = c.optInt("value", 0),
                    ))
                }
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                val stage = data.optString("stage", "")
                currentState = currentState.copy(
                    phase = "stage_changed:$stage",
                    pot = data.optInt("pot", 0),
                    currentBet = data.optInt("currentBet", 0),
                    communityCards = cards,
                    seats = if (seats.isNotEmpty()) seats else currentState.seats,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = mySeat?.currentBet ?: currentState.myCurrentBet,
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_TURN_CHANGED -> {
                Log.i(TAG, "turn_changed event received!")
                val actingIndex = data.optInt("actingIndex", -1)
                val serverSeats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(serverSeats)
                Log.i(TAG, "turn_changed: actingIndex=$actingIndex, mySeatIndex=${mySeat?.seatIndex ?: currentState.mySeatIndex}, isMyTurn=${actingIndex == (mySeat?.seatIndex ?: currentState.mySeatIndex)}")
                val seats = if (serverSeats.isNotEmpty()) serverSeats.toMutableList() else currentState.seats.toMutableList()
                for (i in seats.indices) {
                    seats[i] = seats[i].copy(isActing = i == actingIndex)
                }
                currentState = currentState.copy(
                    actingIndex = actingIndex,
                    pot = data.optInt("pot", currentState.pot),
                    currentBet = data.optInt("currentBet", currentState.currentBet),
                    seats = seats,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = mySeat?.currentBet ?: currentState.myCurrentBet,
                    isMyTurn = actingIndex == (mySeat?.seatIndex ?: currentState.mySeatIndex),
                )
                onStateUpdate(currentState)
            }

            EVT_ACTION_RESULT -> {
                val playerId = data.optString("playerId", "")
                val serverSeats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(serverSeats)
                val seats = if (serverSeats.isNotEmpty()) serverSeats.toMutableList() else currentState.seats.toMutableList()
                for (i in seats.indices) {
                    if (seats[i].playerId == playerId) {
                        val amount = data.optInt("amount", 0)
                        seats[i] = seats[i].copy(
                            lastAction = "${data.optString("action", "")}${if (amount > 0) " $amount" else ""}",
                            isActing = false,
                        )
                    }
                }
                currentState = currentState.copy(
                    seats = seats,
                    pot = data.optInt("pot", currentState.pot),
                    currentBet = data.optInt("currentBet", currentState.currentBet),
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = mySeat?.currentBet ?: currentState.myCurrentBet,
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_SHOWDOWN -> {
                currentState = currentState.copy(phase = "showdown")
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_HAND_RESULT -> {
                val seats = parseSeats(data.optJSONArray("seats"))
                val mySeat = findMySeat(seats)
                currentState = currentState.copy(
                    phase = "hand_result",
                    pot = 0,
                    currentBet = 0,
                    seats = if (seats.isNotEmpty()) seats else currentState.seats,
                    myChips = mySeat?.chipCount ?: currentState.myChips,
                    myCurrentBet = 0,
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_PLAYER_ELIMINATED -> {
                val playerId = data.optString("playerId", "")
                val seats = currentState.seats.toMutableList()
                for (i in seats.indices) {
                    if (seats[i].playerId == playerId) {
                        seats[i] = seats[i].copy(status = "eliminated", lastAction = "淘汰")
                    }
                }
                currentState = currentState.copy(seats = seats)
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_TOURNAMENT_FINISHED -> {
                currentState = currentState.copy(phase = "tournament_finished")
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            EVT_BLIND_LEVEL_UP -> {
                currentState = currentState.copy(
                    blindLevel = data.optInt("level", 1),
                    sb = data.optInt("sb", 10),
                    bb = data.optInt("bb", 20),
                )
                onEvent(name, data)
                onStateUpdate(currentState)
            }

            else -> {
                Log.d(TAG, "Unhandled event: $name")
                onEvent(name, data)
            }
        }
    }
}
