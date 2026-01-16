# 🎯 4 in a Row - Real-time Multiplayer Game

A real-time multiplayer Version of Connect Four (4 in a Row) built with Node.js, WebSockets, React, PostgreSQL, and Kafka for analytics.

## 🎮 Features


- **Real-time 1v1 gameplay** using WebSockets
- **Competitive AI bot** as fallback opponent (10-second matchmaking timeout)
- **Strategic bot logic** that blocks wins and creates winning opportunities
- **Player reconnection** support (30-second window)
- **Leaderboard system** tracking wins, losses, and draws
- **Live online players** display
- **Game analytics** via Kafka (optional)
- **PostgreSQL** for persistent storage

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- Kafka (optional, for analytics)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb four_in_a_row
```

Or using psql:

```sql
CREATE DATABASE four_in_a_row;
```

### 3. Configure Environment

Update `.env` file with your database credentials:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/four_in_a_row
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=four-in-a-row
KAFKA_TOPIC=game-analytics
```

### 4. Start the Backend

```bash
npm start
# or for development with auto-reload:
npm run dev
```

The server will start on `http://localhost:3000`

### 5. Start the Frontend

In a new terminal:

```bash
npm run client
```

The client will start on `http://localhost:3001`

### 6. (Optional) Start Analytics Consumer

If you have Kafka running:

```bash
npm run analytics
```

## 🎲 How to Play

1. Open the app in your browser
2. Enter a username and click "Join Game"
3. Wait for an opponent (or play against the bot after 10 seconds)
4. Click on a column to drop your disc
5. Connect 4 discs horizontally, vertically, or diagonally to win!

## 🏗️ Project Structure

```
prakash/
├── server.js              # Main server with WebSocket handling
├── game.js                # Game logic and state management
├── gameBoard.js           # Board representation and win detection
├── bot.js                 # AI bot with strategic decision-making
├── database.js            # PostgreSQL database operations
├── kafka.js               # Kafka producer for analytics
├── analytics-consumer.js  # Kafka consumer for analytics processing
├── .env                   # Environment configuration
├── package.json           # Backend dependencies
└── client/                # React frontend
    ├── src/
    │   ├── App.js         # Main React component
    │   ├── App.css        # Styling
    │   └── index.js       # React entry point
    └── package.json       # Frontend dependencies
```

## 🤖 Bot AI Strategy

The bot uses a priority-based decision system:

1. **Win Detection** - Takes winning move if available
2. **Block Opponent** - Blocks player's winning move
3. **Strategic Positioning** - Creates opportunities for future wins
4. **Center Preference** - Prefers center columns
5. **Smart Fallback** - Uses center-out column preference

## 🔌 WebSocket API

### Client → Server

**Join Game:**
```json
{
  "type": "join",
  "username": "player1"
}
```

**Make Move:**
```json
{
  "type": "move",
  "column": 3
}
```

**Reconnect:**
```json
{
  "type": "reconnect",
  "username": "player1",
  "gameId": "game_1"
}
```

### Server → Client

**Game Start:**
```json
{
  "type": "game_start",
  "game": { ... }
}
```

**Move Update:**
```json
{
  "type": "move",
  "player": "player1",
  "column": 3,
  "position": { "row": 5, "col": 3 },
  "nextPlayer": "player2",
  "gameOver": false
}
```

**Online Players:**
```json
{
  "type": "online_players",
  "players": ["player1", "player2", ...]
}
```

## 📊 REST API

### Get Leaderboard
```
GET /api/leaderboard
```

Response:
```json
[
  {
    "username": "player1",
    "wins": 10,
    "losses": 5,
    "draws": 2
  }
]
```

### Get Online Players
```
GET /api/online-players
```

Response:
```json
{
  "players": ["player1", "player2"]
}
```

## 📈 Kafka Analytics Events

The system publishes the following events:

- `game_started` - New game created
- `move_made` - Player/bot makes a move
- `game_ended` - Game completed
- `player_disconnected` - Player loses connection
- `player_reconnected` - Player reconnects
- `game_forfeited` - Player doesn't reconnect in time

## 🗃️ Database Schema

### games
```sql
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  player1 VARCHAR(255) NOT NULL,
  player2 VARCHAR(255) NOT NULL,
  winner VARCHAR(255),
  board JSONB,
  duration INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);
```

### leaderboard
```sql
CREATE TABLE leaderboard (
  username VARCHAR(255) PRIMARY KEY,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0
);
```

### analytics
```sql
CREATE TABLE analytics (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(255),
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Configuration

All configuration is done via environment variables in the `.env` file:

- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `KAFKA_BROKERS` - Comma-separated Kafka broker addresses
- `KAFKA_CLIENT_ID` - Kafka client identifier
- `KAFKA_TOPIC` - Topic name for game analytics

## 🛠️ Development

### Run in Development Mode

```bash
npm run dev
```

This uses nodemon to auto-restart the server on file changes.

### Testing Without Kafka

Kafka is optional. If Kafka connection fails, the server will continue to work without analytics. Analytics events will be logged to console but not sent to Kafka.

## 📝 Notes

- Games are stored in memory during play and persisted to database when completed
- Bot games update the leaderboard but are not saved to the games table (optional)
- Disconnected players have 30 seconds to reconnect before forfeiting
- The matchmaking queue uses a 10-second timeout before starting a bot game
- Frontend runs on port 3001, backend on port 3000

## 🎯 Game Rules

- 7 columns × 6 rows grid
- Players alternate dropping discs
- Discs fall to the lowest available position in a column
- First to connect 4 discs (horizontally, vertically, or diagonally) wins
- If the board fills with no winner, it's a draw

## 🚀 Production Deployment

For production deployment:

1. Set up a production PostgreSQL database
2. Configure environment variables for production
3. Build the React frontend: `cd client && npm run build`
4. Serve the built frontend from the backend or use a CDN
5. Set up Kafka cluster for analytics (optional)
6. Use a process manager like PM2: `pm2 start server.js`

## 📄 License

ISC
