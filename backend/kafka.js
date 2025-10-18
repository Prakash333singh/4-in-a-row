// kafka.js
const { Kafka } = require("kafkajs")

let kafka
let producer
let isConnecting = false
let messageQueue = []

// --- Initialize or Reconnect ---
const connectProducer = async () => {
  if (isConnecting) return // prevent multiple parallel connects
  isConnecting = true

  try {
    if (!kafka) {
      kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || "four-in-a-row",
        brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
        connectionTimeout: 5000,
        retry: { retries: 3 },
      })
    }

    producer = kafka.producer({
      allowAutoTopicCreation: true,
      retry: { retries: 5 },
    })

    await producer.connect()
    console.log("✅ Kafka producer connected")

    // Flush any queued messages
    while (messageQueue.length > 0) {
      const { eventType, data } = messageQueue.shift()
      await publishEvent(eventType, data)
    }
  } catch (err) {
    console.error("⚠️ Kafka connect failed:", err.message)
    setTimeout(connectProducer, 5000) // retry after 5s
  } finally {
    isConnecting = false
  }
}

// --- Publish Safely ---
const publishEvent = async (eventType, data) => {
  if (!producer) {
    console.warn("⚠️ Kafka producer not ready, queueing message")
    messageQueue.push({ eventType, data })
    connectProducer() // try reconnect
    return
  }

  try {
    // kafkajs exposes `producer.isConnected()` internally
    if (!producer._isConnected()) {
      throw new Error("Producer not connected")
    }

    await producer.send({
      topic: process.env.KAFKA_TOPIC || "game-analytics",
      messages: [
        {
          key: eventType,
          value: JSON.stringify({
            eventType,
            timestamp: new Date().toISOString(),
            data,
          }),
        },
      ],
    })
  } catch (err) {
    console.error("Error publishing to Kafka:", err.message)

    // Queue and reconnect if needed
    if (
      err.message.includes("disconnected") ||
      err.message.includes("closed")
    ) {
      messageQueue.push({ eventType, data })
      await connectProducer()
    }
  }
}

// --- Graceful Shutdown ---
const closeKafka = async () => {
  try {
    if (producer) {
      await producer.disconnect()
      console.log("Kafka producer disconnected")
    }
  } catch (err) {
    console.error("Error closing Kafka:", err.message)
  }
}

module.exports = {
  connectProducer,
  publishEvent,
  closeKafka,
}
