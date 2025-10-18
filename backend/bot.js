class Bot {
  constructor(symbol) {
    this.symbol = symbol
  }

  // Main method called by Game class - accepts board array or GameBoard object
  getBestMove(board) {
    // Handle both GameBoard object and plain array
    const boardArray = board.board ? board.board : board
    return this.findBestMove(boardArray)
  }

  // Find best move for the bot
  findBestMove(board) {
    // Try to win first
    const winningMove = this.findWinningMove(board, this.symbol)
    if (winningMove !== null) return winningMove

    // Block opponent from winning
    const opponentSymbol = this.symbol === "X" ? "O" : "X"
    const blockingMove = this.findWinningMove(board, opponentSymbol)
    if (blockingMove !== null) return blockingMove

    // Prefer center columns (better strategy)
    const centerColumns = [3, 2, 4, 1, 5, 0, 6]
    for (const col of centerColumns) {
      if (this.isValidMove(board, col)) return col
    }

    // Fallback to any valid move
    for (let col = 0; col < 7; col++) {
      if (this.isValidMove(board, col)) return col
    }

    return null
  }

  isValidMove(board, col) {
    if (col < 0 || col >= 7) return false
    // Check if top row has space
    return board[0][col] === null || board[0][col] === undefined
  }

  findWinningMove(board, symbol) {
    for (let col = 0; col < 7; col++) {
      if (!this.isValidMove(board, col)) continue

      // Simulate the move
      const row = this.getLowestEmptyRow(board, col)
      if (row === -1) continue

      board[row][col] = symbol

      // Check if this move wins
      if (this.checkWin(board, row, col, symbol)) {
        board[row][col] = null // Undo simulation
        return col
      }

      board[row][col] = null // Undo simulation
    }
    return null
  }

  getLowestEmptyRow(board, col) {
    for (let row = 5; row >= 0; row--) {
      if (board[row][col] === null || board[row][col] === undefined) {
        return row
      }
    }
    return -1
  }

  checkWin(board, row, col, symbol) {
    // Check horizontal
    if (this.checkDirection(board, row, col, 0, 1, symbol)) return true
    // Check vertical
    if (this.checkDirection(board, row, col, 1, 0, symbol)) return true
    // Check diagonal /
    if (this.checkDirection(board, row, col, -1, 1, symbol)) return true
    // Check diagonal \
    if (this.checkDirection(board, row, col, 1, 1, symbol)) return true

    return false
  }

  checkDirection(board, row, col, dRow, dCol, symbol) {
    let count = 0

    // Count in positive direction
    let r = row
    let c = col
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) {
      count++
      r += dRow
      c += dCol
    }

    // Count in negative direction (excluding center)
    r = row - dRow
    c = col - dCol
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === symbol) {
      count++
      r -= dRow
      c -= dCol
    }

    return count >= 4
  }
}

module.exports = Bot
