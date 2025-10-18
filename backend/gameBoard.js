class GameBoard {
  constructor() {
    this.board = Array(6)
      .fill(null)
      .map(() => Array(7).fill(null))
  }

  makeMove(col, symbol) {
    if (col < 0 || col >= 7) return null

    // Find the lowest empty row
    for (let row = 5; row >= 0; row--) {
      if (this.board[row][col] === null) {
        this.board[row][col] = symbol
        return { row, col }
      }
    }
    return null // Column is full
  }

  checkWinner() {
    // Check horizontal, vertical, and diagonal
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        const symbol = this.board[row][col]
        if (symbol && this.checkFromPosition(row, col, symbol)) {
          return symbol
        }
      }
    }
    return null
  }

  checkFromPosition(row, col, symbol) {
    // Check all 4 directions
    const directions = [
      [0, 1], // horizontal
      [1, 0], // vertical
      [1, 1], // diagonal \
      [1, -1], // diagonal /
    ]

    for (const [dRow, dCol] of directions) {
      let count = 1

      // Check positive direction
      let r = row + dRow
      let c = col + dCol
      while (
        r >= 0 &&
        r < 6 &&
        c >= 0 &&
        c < 7 &&
        this.board[r][c] === symbol
      ) {
        count++
        r += dRow
        c += dCol
      }

      // Check negative direction
      r = row - dRow
      c = col - dCol
      while (
        r >= 0 &&
        r < 6 &&
        c >= 0 &&
        c < 7 &&
        this.board[r][c] === symbol
      ) {
        count++
        r -= dRow
        c -= dCol
      }

      if (count >= 4) return true
    }
    return false
  }

  isFull() {
    return this.board[0].every((cell) => cell !== null)
  }

  getState() {
    return this.board
  }
}

module.exports = GameBoard
