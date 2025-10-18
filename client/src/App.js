import { useState, useEffect, useRef } from "react"
import "./App.css"

const WS_URL = "ws://localhost:5000"
const API_URL = "http://localhost:5000/api"

function App() {
  const [username, setUsername] = useState("")
  const [gameState, setGameState] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [status, setStatus] = useState("")
  const [leaderboard, setLeaderboard] = useState([])
  const [onlinePlayers, setOnlinePlayers] = useState([])
  const wsRef = useRef(null)
  const pendingUsernameRef = useRef(null)

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  useEffect(() => {
    if (gameState?.status === "completed") {
      fetchLeaderboard()
    }
  }, [gameState?.status])

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(`${API_URL}/leaderboard`)
      const data = await response.json()
      setLeaderboard(data)
    } catch (error) {
      console.error("Error fetching leaderboard:", error)
    }
  }

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log("Connected to server")
      setIsConnected(true)
      setIsConnecting(false)

      // Send join message immediately after connection
      if (pendingUsernameRef.current) {
        ws.send(
          JSON.stringify({
            type: "join",
            username: pendingUsernameRef.current,
          })
        )
        pendingUsernameRef.current = null
      }
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log("Received:", data)

      switch (data.type) {
        case "waiting":
          setStatus("⏳ Waiting for opponent... (Bot will join in 10 seconds)")
          break

        case "game_start":
          setGameState(data.game)
          if (data.message && data.message.includes("BOT")) {
            setStatus("🤖 Playing against BOT - Good luck!")
          } else {
            setStatus(`🎮 Game started! ${data.game.currentPlayer}'s turn`)
          }
          break

        case "move":
          setGameState((prev) => {
            if (!prev) return prev

            // Handle board being either array directly or nested in object
            const currentBoard = Array.isArray(prev.board)
              ? prev.board
              : prev.board.board || prev.board

            // Deep clone the board
            const newBoard = currentBoard.map((row) => [...row])

            // Update the cell with the move
            newBoard[data.position.row][data.position.col] =
              prev.playerSymbols[data.player]

            return {
              ...prev,
              board: newBoard,
              currentPlayer: data.nextPlayer,
              status: data.gameOver ? "completed" : prev.status,
              winner: data.winner,
            }
          })

          if (data.gameOver) {
            if (data.winner === "draw") {
              setStatus("🤝 Game Over - It's a Draw!")
            } else {
              setStatus(`🎉 Game Over - ${data.winner} wins!`)
            }
          } else {
            setStatus(`${data.nextPlayer}'s turn`)
          }
          break

        case "online_players":
          setOnlinePlayers(data.players)
          break

        case "opponent_disconnected":
          setStatus(
            `⚠️ ${data.player} disconnected. Waiting for reconnection (30s)...`
          )
          break

        case "opponent_reconnected":
          setStatus(`✅ ${data.player} reconnected! Game continues...`)
          setTimeout(() => {
            if (gameState && gameState.status === "active") {
              setStatus(`${gameState.currentPlayer}'s turn`)
            }
          }, 2000)
          break

        case "game_over":
          if (data.reason === "forfeit") {
            setStatus(`🏆 Game Over - ${data.winner} wins by forfeit!`)
          }
          setGameState((prev) =>
            prev ? { ...prev, status: "completed", winner: data.winner } : prev
          )
          break

        case "error":
          setStatus(`❌ Error: ${data.message}`)
          break

        default:
          console.log("Unknown message type:", data.type)
      }
    }

    ws.onclose = () => {
      console.log("Disconnected from server")
      setIsConnected(false)
      setIsConnecting(false)
      pendingUsernameRef.current = null
      setStatus("❌ Disconnected from server. Please refresh and try again.")
    }

    ws.onerror = (error) => {
      console.error("WebSocket error:", error)
      setIsConnecting(false)
      setStatus("❌ Connection error. Please check if the server is running.")
    }

    wsRef.current = ws
  }

  const handleJoin = (e) => {
    e.preventDefault()
    if (username.trim() && !isConnecting) {
      setIsConnecting(true)
      setStatus("🔌 Connecting to server...")
      pendingUsernameRef.current = username.trim()
      connectWebSocket()
    }
  }

  const handleColumnClick = (col) => {
    if (!gameState || gameState.status !== "active") return
    if (gameState.currentPlayer !== username) {
      setStatus("⚠️ Not your turn!")
      return
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "move",
          column: col,
        })
      )
    }
  }

  const handleNewGame = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    setGameState(null)
    setIsConnected(false)
    setStatus("")
  }

  // Helper function to get board array
  const getBoardArray = () => {
    if (!gameState?.board) return null
    return Array.isArray(gameState.board)
      ? gameState.board
      : gameState.board.board || gameState.board
  }

  if (!isConnected) {
    return (
      <div className="App">
        <div className="container">
          <h1>🎯 4 in a Row</h1>
          {status && isConnecting && (
            <div className="connecting-status">{status}</div>
          )}
          <form onSubmit={handleJoin} className="join-form">
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="username-input"
              disabled={isConnecting}
              required
            />
            <button
              type="submit"
              className="join-button"
              disabled={isConnecting}
            >
              {isConnecting ? "🔄 Connecting..." : "Join Game"}
            </button>
          </form>

          {leaderboard.length > 0 && (
            <div className="leaderboard">
              <h2>🏅 Leaderboard</h2>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Draws</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player, index) => (
                    <tr key={player.username}>
                      <td>{index + 1}</td>
                      <td>{player.username}</td>
                      <td>{player.wins}</td>
                      <td>{player.losses}</td>
                      <td>{player.draws}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  const boardArray = getBoardArray()

  return (
    <div className="App">
      <div className="container">
        <h1>🎯 4 in a Row</h1>

        <div className="game-info">
          <div className="status">{status}</div>
          {gameState && (
            <>
              <div className="players">
                <div
                  className={`player ${
                    gameState.currentPlayer === gameState.player1
                      ? "active"
                      : ""
                  }`}
                >
                  {gameState.player1} (X)
                  {gameState.currentPlayer === gameState.player1 && " ← Turn"}
                </div>
                <div className="vs">VS</div>
                <div
                  className={`player ${
                    gameState.currentPlayer === gameState.player2
                      ? "active"
                      : ""
                  }`}
                >
                  {gameState.player2} (O)
                  {gameState.currentPlayer === gameState.player2 && " ← Turn"}
                </div>
              </div>
            </>
          )}
        </div>

        {boardArray && (
          <div className="game-board">
            <div className="column-indicators">
              {[0, 1, 2, 3, 4, 5, 6].map((col) => (
                <div
                  key={col}
                  className={`column-indicator ${
                    gameState?.status === "active" &&
                    gameState?.currentPlayer === username
                      ? "clickable"
                      : ""
                  }`}
                  onClick={() => handleColumnClick(col)}
                >
                  ↓
                </div>
              ))}
            </div>
            {boardArray.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row">
                {row.map((cell, colIndex) => (
                  <div
                    key={colIndex}
                    className={`cell ${cell ? "filled" : ""} ${
                      cell === "X" ? "player-x" : cell === "O" ? "player-o" : ""
                    }`}
                    onClick={() => handleColumnClick(colIndex)}
                  >
                    {cell && <div className="disc">{cell}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {gameState?.status === "completed" && (
          <button onClick={handleNewGame} className="new-game-button">
            🎮 New Game
          </button>
        )}

        <div className="sidebar">
          {onlinePlayers.length > 0 && (
            <div className="online-players">
              <h3>👥 Online Players ({onlinePlayers.length})</h3>
              <ul>
                {onlinePlayers.map((player) => (
                  <li
                    key={player}
                    className={player === username ? "current-player" : ""}
                  >
                    {player}
                    {player === username && " (You)"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {leaderboard.length > 0 && (
            <div className="leaderboard">
              <h3>🏅 Leaderboard</h3>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.slice(0, 5).map((player, index) => (
                    <tr key={player.username}>
                      <td>{index + 1}</td>
                      <td>{player.username}</td>
                      <td>{player.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
