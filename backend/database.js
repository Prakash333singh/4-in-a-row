const {prisma} = require('./lib/prisma');

// Safe leaderboard update function
const updateLeaderboard = async (player1, player2, winner) => {
  try {
    // Don't update leaderboard for BOT games
    if (player2 === "BOT") {
      // Only update the human player
      await prisma.leaderboard.upsert({
        where: { username: player1 },
        update: {},
        create: { username: player1 },
      })

      if (winner === player1) {
        await prisma.leaderboard.update({
          where: { username: player1 },
          data: { wins: { increment: 1 } },
        })
      } else if (winner === "BOT") {
        await prisma.leaderboard.update({
          where: { username: player1 },
          data: { losses: { increment: 1 } },
        })
      } else if (winner === "draw") {
        await prisma.leaderboard.update({
          where: { username: player1 },
          data: { draws: { increment: 1 } },
        })
      }
      return
    }

    // Keep transaction short & atomic for player vs player games
    await prisma.$transaction(
      async (tx) => {
        // Upsert players in parallel (shortens transaction time)
        await Promise.all([
          tx.leaderboard.upsert({
            where: { username: player1 },
            update: {},
            create: { username: player1 },
          }),
          tx.leaderboard.upsert({
            where: { username: player2 },
            update: {},
            create: { username: player2 },
          }),
        ])

        if (winner === "draw") {
          // Update both players' draw counts together
          await Promise.all([
            tx.leaderboard.update({
              where: { username: player1 },
              data: { draws: { increment: 1 } },
            }),
            tx.leaderboard.update({
              where: { username: player2 },
              data: { draws: { increment: 1 } },
            }),
          ])
        } else {
          const loser = winner === player1 ? player2 : player1

          await Promise.all([
            tx.leaderboard.update({
              where: { username: winner },
              data: { wins: { increment: 1 } },
            }),
            tx.leaderboard.update({
              where: { username: loser },
              data: { losses: { increment: 1 } },
            }),
          ])
        }
      },
      { timeout: 8000 }
    )
  } catch (err) {
    console.error("❌ Error updating leaderboard:", err)
  }
}

// Store completed games
const saveGame = async (game) => {
  try {
    // Don't save BOT games to database
    if (game.player2 === "BOT") {
      console.log("ℹ️ Skipping save for BOT game")
      return null
    }

    return await prisma.game.create({
      data: {
        player1: game.player1,
        player2: game.player2,
        winner: game.winner,
        board: JSON.stringify(game.board), // Convert array to JSON string
        duration: game.duration || 0,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    console.error("❌ Error saving game:", err)
    return null
  }
}

// Read leaderboard efficiently
const getLeaderboard = async () => {
  try {
    return await prisma.leaderboard.findMany({
      select: { username: true, wins: true, losses: true, draws: true },
      orderBy: [{ wins: "desc" }, { losses: "asc" }],
      take: 10,
    })
  } catch (err) {
    console.error("❌ Error fetching leaderboard:", err)
    return []
  }
}

module.exports = {
  prisma,
  saveGame,
  updateLeaderboard,
  getLeaderboard,
}
