const GameBoard = require("./gameBoard")
const Bot = require("./bot")
const { saveGame, updateLeaderboard } = require("./database")
const { recordEvent } = require("./analytics-consumer")

class Game {
  constructor(gameId, player1, player2 = null) {
    this.gameId = gameId
    this.player1 = player1
    this.player2 = player2
    this.isBot = player2 === "BOT"
    this.board = new GameBoard()
    this.currentPlayer = player1
    this.winner = null
    this.status = "waiting" // waiting, active, completed
    this.startTime = Date.now()
    this.lastMoveTime = Date.now()
    this.disconnectedPlayers = new Map()

    if (this.isBot) {
      this.bot = new Bot("O")
      this.playerSymbols = {
        [player1]: "X",
        BOT: "O",
      }
    } else {
      this.playerSymbols = {
        [player1]: "X",
        [player2]: "O",
      }
    }
  }

  start() {
    this.status = "active"
    this.startTime = Date.now()
    recordEvent("GAME_STARTED", {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2 || "BOT",
    })
  }

  makeMove(player, col) {
    if (this.status !== "active") {
      return { success: false, error: "Game not active" }
    }

    if (player !== this.currentPlayer) {
      return { success: false, error: "Not your turn" }
    }

    const playerSymbol = this.playerSymbols[player]
    const result = this.board.makeMove(col, playerSymbol)

    if (!result) {
      return { success: false, error: "Invalid move" }
    }

    this.lastMoveTime = Date.now()

    recordEvent("MOVE_MADE", {
      gameId: this.gameId,
      player,
      column: col,
      row: result.row,
    })

    // Check for winner or draw
    const winner = this.board.checkWinner()
    if (winner) {
      this.winner = Object.keys(this.playerSymbols).find(
        (key) => this.playerSymbols[key] === winner
      )
      this.status = "completed"
      this.endGame(this.winner)
      return {
        success: true,
        position: result,
        winner: this.winner,
        gameOver: true,
      }
    }

    if (this.board.isFull()) {
      this.winner = "draw"
      this.status = "completed"
      this.endGame("draw")
      return {
        success: true,
        position: result,
        winner: "draw",
        gameOver: true,
      }
    }

    // Switch turns
    this.currentPlayer = this.getOpponent(player)

    return {
      success: true,
      position: result,
      nextPlayer: this.currentPlayer,
      gameOver: false,
    }
  }

  async makeBotMove() {
    if (
      !this.isBot ||
      this.currentPlayer !== "BOT" ||
      this.status !== "active"
    ) {
      return null
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    const col = this.bot.getBestMove(this.board)
    return this.makeMove("BOT", col)
  }

  getOpponent(player) {
    if (this.isBot) {
      return player === this.player1 ? "BOT" : this.player1
    }
    return player === this.player1 ? this.player2 : this.player1
  }

  async endGame(winner) {
    const duration = Math.floor((Date.now() - this.startTime) / 1000)

    recordEvent("GAME_ENDED", {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2 || "BOT",
      winner,
      duration,
    })

    // Always update leaderboard (handles BOT games correctly)
    try {
      await updateLeaderboard(this.player1, this.player2 || "BOT", winner)
    } catch (error) {
      console.error("Error updating leaderboard:", error)
    }

    // Only save to database if it's a player vs player game
    if (!this.isBot) {
      try {
        await saveGame({
          player1: this.player1,
          player2: this.player2,
          winner,
          board: this.board.board,
          duration,
        })
      } catch (error) {
        console.error("Error saving game:", error)
      }
    }
  }

  handleDisconnect(player) {
    this.disconnectedPlayers.set(player, Date.now())
    recordEvent("PLAYER_DISCONNECTED", {
      gameId: this.gameId,
      player,
    })
  }

  handleReconnect(player) {
    this.disconnectedPlayers.delete(player)
    recordEvent("PLAYER_RECONNECTED", {
      gameId: this.gameId,
      player,
    })
  }

  checkDisconnectTimeout() {
    const now = Date.now()
    for (const [player, disconnectTime] of this.disconnectedPlayers) {
      if (now - disconnectTime > 30000) {
        // 30 seconds
        this.forfeitGame(player)
        return true
      }
    }
    return false
  }

  async forfeitGame(player) {
    this.status = "completed"
    this.winner = this.getOpponent(player)
    await this.endGame(this.winner)
    recordEvent("GAME_FORFEITED", {
      gameId: this.gameId,
      forfeitedBy: player,
      winner: this.winner,
    })
  }

  getState() {
    return {
      gameId: this.gameId,
      player1: this.player1,
      player2: this.player2,
      currentPlayer: this.currentPlayer,
      board: this.board.getState(),
      status: this.status,
      winner: this.winner,
      playerSymbols: this.playerSymbols,
      isBot: this.isBot,
    }
  }
}

module.exports = Game
