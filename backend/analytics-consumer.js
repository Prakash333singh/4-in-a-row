const { prisma } = require("./database")

// In-memory analytics summary
const analytics = {
  totalGames: 0,
  gamesPerDay: {},
  gamesPerHour: {},
  totalDuration: 0,
  winnerFrequency: {},
  playerStats: {},
}

// Initialize analytics table via Prisma migrations (recommended)
async function initAnalytics() {
  try {
    // Prisma does not allow dynamic table creation at runtime
    // Ensure you run: `npx prisma migrate dev --name init_analytics`
    console.log("✅ Analytics table ready (managed via Prisma migration)")
  } catch (err) {
    console.error("❌ Error initializing analytics:", err)
  }
}

// Record an event (store in DB + process in-memory)
async function recordEvent(eventType, data = {}) {
  const timestamp = new Date().toISOString()

  try {
    await prisma.analytics.create({
      data: {
        eventType,
        eventData: data,
      },
    })
  } catch (err) {
    console.error("❌ Failed to insert analytics event:", err.message)
  }

  processEvent({ eventType, timestamp, data })
}

// Process events for in-memory analytics summary
function processEvent({ eventType, timestamp, data }) {
  switch (eventType) {
    case "GAME_STARTED":
      analytics.totalGames++
      const date = timestamp.split("T")[0]
      analytics.gamesPerDay[date] = (analytics.gamesPerDay[date] || 0) + 1
      const hour = new Date(timestamp).getHours()
      analytics.gamesPerHour[hour] = (analytics.gamesPerHour[hour] || 0) + 1
      break

    case "GAME_ENDED":
    case "BOT_GAME_ENDED":
      if (data.duration) analytics.totalDuration += data.duration

      if (data.winner && data.winner !== "draw") {
        analytics.winnerFrequency[data.winner] =
          (analytics.winnerFrequency[data.winner] || 0) + 1
      }

      ;[data.player1, data.player2].forEach((player) => {
        if (!player) return
        if (!analytics.playerStats[player]) {
          analytics.playerStats[player] = {
            gamesPlayed: 0,
            wins: 0,
            totalDuration: 0,
          }
        }
        analytics.playerStats[player].gamesPlayed++
        analytics.playerStats[player].totalDuration += data.duration || 0

        if (data.winner === player) analytics.playerStats[player].wins++
      })
      break

    case "GAME_FORFEIT":
      if (data.winner) {
        analytics.winnerFrequency[data.winner] =
          (analytics.winnerFrequency[data.winner] || 0) + 1
      }
      break
  }

  logSummary()
}

// Log in-memory analytics summary
function logSummary() {
  const avgDuration =
    analytics.totalGames > 0
      ? (analytics.totalDuration / analytics.totalGames).toFixed(2)
      : 0

  console.log("\n=== Game Analytics Summary ===")
  console.log(`Total Games: ${analytics.totalGames}`)
  console.log(`Avg Game Duration: ${avgDuration}s`)
  console.log("Top Winners:", Object.entries(analytics.winnerFrequency))
  console.log("=============================\n")
}

// Return in-memory analytics summary
function getAnalyticsSummary() {
  return analytics
}

module.exports = {
  initAnalytics,
  recordEvent,
  getAnalyticsSummary,
}
