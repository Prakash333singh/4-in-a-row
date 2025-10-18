require("dotenv").config()
const express = require("express")
const http = require("http")
const WebSocket = require("ws")
const cors = require("cors")
const { getLeaderboard, saveGame, updateLeaderboard } = require("./database")
const Game = require("./game")
const { recordEvent, initAnalytics } = require("./analytics-consumer")

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

app.use(cors())
app.use(express.json())

// In-memory storage
const games = new Map()
const waitingPlayers = []
const playerConnections = new Map() // username -> ws
const playerGameIds = new Map() // username -> gameId
const onlinePlayers = new Set()

let gameIdCounter = 1

// ===== API ROUTES =====
app.get("/api/health", (req, res) => res.json({ status: "ok" }))

app.get("/api/leaderboard", async (req, res) => {
  try {
    const leaderboard = await getLeaderboard()
    res.json(leaderboard)
  } catch (error) {
    console.error("Error fetching leaderboard:", error)
    res.status(500).json({ error: "Failed to fetch leaderboard" })
  }
})

app.get("/api/online-players", (req, res) => {
  res.json({ players: Array.from(onlinePlayers) })
})

app.get("/api/analytics", (req, res) => {
  const { getAnalyticsSummary } = require("./analytics")
  res.json(getAnalyticsSummary())
})

// ===== WEBSOCKET HANDLERS =====
wss.on("connection", (ws) => {
  let username = null

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message)
      switch (data.type) {
        case "join":
          handleJoin(ws, data)
          break
        case "move":
          await handleMove(ws, data)
          break
        case "reconnect":
          handleReconnect(ws, data)
          break
        default:
          ws.send(
            JSON.stringify({ type: "error", message: "Unknown message type" })
          )
      }
    } catch (error) {
      console.error("Error handling message:", error)
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid message format" })
      )
    }
  })

  ws.on("close", () => handleDisconnect(ws))

  // === Player joins ===
  function handleJoin(ws, data) {
    username = data.username
    playerConnections.set(username, ws)
    onlinePlayers.add(username)
    broadcastOnlinePlayers()

    if (waitingPlayers.length > 0) {
      const opponent = waitingPlayers.shift()
      const gameId = `game_${gameIdCounter++}`
      const game = new Game(gameId, opponent.username, username)
      games.set(gameId, game)
      game.start()

      playerGameIds.set(opponent.username, gameId)
      playerGameIds.set(username, gameId)

      const gameState = game.getState()
      opponent.ws.send(JSON.stringify({ type: "game_start", game: gameState }))
      ws.send(JSON.stringify({ type: "game_start", game: gameState }))

      recordEvent("GAME_STARTED", {
        player1: opponent.username,
        player2: username,
      })
    } else {
      waitingPlayers.push({ username, ws })
      ws.send(
        JSON.stringify({ type: "waiting", message: "Waiting for opponent..." })
      )

      setTimeout(() => {
        const index = waitingPlayers.findIndex((p) => p.username === username)
        if (index !== -1) {
          waitingPlayers.splice(index, 1)
          const gameId = `game_${gameIdCounter++}`
          const game = new Game(gameId, username, "BOT")
          games.set(gameId, game)
          game.start()

          playerGameIds.set(username, gameId)
          ws.send(
            JSON.stringify({
              type: "game_start",
              game: game.getState(),
              message: "Playing against BOT",
            })
          )

          recordEvent("BOT_GAME_STARTED", { player: username })
        }
      }, 10000)
    }
  }

  // === Player makes a move ===
  async function handleMove(ws, data) {
    const gameId = playerGameIds.get(username)
    if (!gameId)
      return ws.send(
        JSON.stringify({ type: "error", message: "Not in a game" })
      )

    const game = games.get(gameId)
    if (!game)
      return ws.send(
        JSON.stringify({ type: "error", message: "Game not found" })
      )

    const result = game.makeMove(username, data.column)
    if (!result.success)
      return ws.send(JSON.stringify({ type: "error", message: result.error }))

    broadcastToGame(game, {
      type: "move",
      player: username,
      column: data.column,
      position: result.position,
      nextPlayer: result.nextPlayer,
      gameOver: result.gameOver,
      winner: result.winner,
    })

    if (result.gameOver) {
      await saveGame(game)
      await updateLeaderboard(game.player1, game.player2, result.winner)
      recordEvent("GAME_ENDED", { gameId, winner: result.winner })

      setTimeout(() => cleanupGame(gameId), 5000)
    } else if (game.isBot && result.nextPlayer === "BOT") {
      setTimeout(async () => {
        const botResult = await game.makeBotMove()
        if (botResult?.success) {
          broadcastToGame(game, {
            type: "move",
            player: "BOT",
            column: botResult.position.col,
            position: botResult.position,
            nextPlayer: botResult.nextPlayer,
            gameOver: botResult.gameOver,
            winner: botResult.winner,
          })

          if (botResult.gameOver) {
            await saveGame(game)
            await updateLeaderboard(
              game.player1,
              game.player2,
              botResult.winner
            )
            recordEvent("BOT_GAME_ENDED", { gameId, winner: botResult.winner })

            setTimeout(() => cleanupGame(gameId), 5000)
          }
        }
      }, 500)
    }
  }

  // === Reconnect ===
  function handleReconnect(ws, data) {
    username = data.username
    const gameId = data.gameId
    const game = games.get(gameId)

    playerConnections.set(username, ws)
    onlinePlayers.add(username)

    if (!game)
      return ws.send(
        JSON.stringify({ type: "error", message: "Game not found" })
      )
    if (![game.player1, game.player2].includes(username))
      return ws.send(
        JSON.stringify({ type: "error", message: "Not part of this game" })
      )

    playerGameIds.set(username, gameId)
    game.handleReconnect(username)

    ws.send(JSON.stringify({ type: "reconnected", game: game.getState() }))

    const opponent = game.getOpponent(username)
    const opponentWs = playerConnections.get(opponent)
    if (opponentWs)
      opponentWs.send(
        JSON.stringify({ type: "opponent_reconnected", player: username })
      )

    broadcastOnlinePlayers()
  }

  // === Disconnect ===
  function handleDisconnect() {
    if (!username) return

    onlinePlayers.delete(username)
    playerConnections.delete(username)
    const waitingIndex = waitingPlayers.findIndex(
      (p) => p.username === username
    )
    if (waitingIndex !== -1) waitingPlayers.splice(waitingIndex, 1)

    const gameId = playerGameIds.get(username)
    if (gameId) {
      const game = games.get(gameId)
      if (game && game.status === "active") {
        game.handleDisconnect(username)
        const opponent = game.getOpponent(username)
        const opponentWs = playerConnections.get(opponent)
        if (opponentWs)
          opponentWs.send(
            JSON.stringify({ type: "opponent_disconnected", player: username })
          )

        setTimeout(async () => {
          if (games.has(gameId) && !game.checkDisconnectTimeout()) {
            broadcastToGame(game, {
              type: "game_over",
              winner: game.winner,
              reason: "forfeit",
            })
            await saveGame(game)
            await updateLeaderboard(game.player1, game.player2, game.winner)
            recordEvent("GAME_FORFEIT", { gameId, winner: game.winner })
            cleanupGame(gameId)
          }
        }, 30000)
      }
    }

    broadcastOnlinePlayers()
  }
})

// ===== UTILITIES =====
function broadcastToGame(game, data) {
  ;[game.player1, game.player2].forEach((player) => {
    const ws = playerConnections.get(player)
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
  })
}

function broadcastOnlinePlayers() {
  const payload = JSON.stringify({
    type: "online_players",
    players: Array.from(onlinePlayers),
  })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload)
  })
}

function cleanupGame(gameId) {
  const game = games.get(gameId)
  if (!game) return
  games.delete(gameId)
  playerGameIds.delete(game.player1)
  if (game.player2 && game.player2 !== "BOT") playerGameIds.delete(game.player2)
}

// ===== SERVER INIT ====
const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    await initAnalytics()
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📡 WebSocket server ready`)
    })
  } catch (err) {
    console.error("Failed to start server:", err)
    process.exit(1)
  }
}

startServer()