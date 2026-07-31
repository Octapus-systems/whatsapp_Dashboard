const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Wirebot Configuration
const WIREBOT_API_URL = process.env.WIREBOT_API_URL || 'http://localhost:2785/api';
const WIREBOT_API_KEY = process.env.WIREBOT_API_KEY || 'dev-admin-key';
const PORT = process.env.PORT || 5000;

console.log('🤖 Auto-Responder Bot is initializing...');
console.log(`🔗 Target Wirebot REST API: ${WIREBOT_API_URL}`);
console.log(`🔑 Using API Key: ${WIREBOT_API_KEY}`);

/**
 * Send a reply message using Wirebot REST API
 * @param {string} sessionId - The WhatsApp session ID
 * @param {string} chatId - Target chat/user ID
 * @param {string} text - Message to reply with
 */
async function sendReply(sessionId, chatId, text) {
  try {
    const url = `${WIREBOT_API_URL}/sessions/${sessionId}/messages/send-text`;
    const payload = {
      chatId: chatId,
      text: text
    };
    
    console.log(`✉️ Sending message to ${chatId}: "${text}"`);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': WIREBOT_API_KEY
      }
    });

    console.log(`✅ Message sent successfully! Msg ID: ${response.data.id || 'N/A'}`);
  } catch (error) {
    console.error('❌ Failed to send reply via Wirebot API:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Details:`, error.response.data);
    } else {
      console.error(`   Message: ${error.message}`);
    }
  }
}

/**
 * POST /webhook
 * Endpoint registered in Wirebot to receive incoming event notifications.
 */
app.post('/webhook', async (req, res) => {
  const { event, sessionId, data } = req.body;

  // Immediately respond with 200 OK to acknowledge receipt
  res.status(200).json({ received: true });

  // Verify the event is a message received
  if (event !== 'message.received') {
    return;
  }

  // Extract the message payload
  const message = data;
  if (!message) return;

  const { id, body, from, chatId, fromMe, isGroup } = message;

  // 1. Prevent infinite loops: Never reply to messages sent by ourselves
  if (fromMe) {
    return;
  }

  // 2. Ignore group messages by default to avoid spamming groups
  if (isGroup) {
    console.log(`👥 Group message received in ${chatId} from ${from}, ignoring.`);
    return;
  }

  console.log(`📥 Message received from ${from}: "${body}"`);

  // Normalize incoming text
  const incomingText = (body || '').trim().toLowerCase();

  // 3. Define auto-reply rules
  let replyText = '';

  if (incomingText === 'hi' || incomingText === 'hello' || incomingText === 'hey') {
    replyText = `👋 Hello! I am your automated WhatsApp Bot assistant.\n\nType *menu* or *help* to see what I can do!`;
  } else if (incomingText === 'menu' || incomingText === 'help') {
    replyText = `🤖 *Main Menu* 🤖\n\nPlease select/type an option:\n\n1️⃣ *Info* - Learn about this system\n2️⃣ *Status* - Check system health\n3️⃣ *Ping* - Simple connectivity test`;
  } else if (incomingText === '1' || incomingText === 'info') {
    replyText = `ℹ️ *System Information*\n\nThis bot is powered by *Wirebot* (Open Source WhatsApp API Gateway) and Node.js. It operates entirely locally on your machine, enabling you to automate messaging workflows.`;
  } else if (incomingText === '2' || incomingText === 'status') {
    replyText = `🟢 *System Status*\n\n• Connection: Online\n• Latency: Excellent\n• Memory: Healthy`;
  } else if (incomingText === '3' || incomingText === 'ping') {
    replyText = `🏓 *Pong!*\n\nConnection between Wirebot and the bot is fully functional!`;
  } else {
    // Default reply if no rules match
    replyText = `🤖 Thank you for your message: "${body}".\n\nType *menu* to see a list of available automated commands.`;
  }

  // Send the computed reply
  if (replyText) {
    await sendReply(sessionId, chatId, replyText);
  }
});

// Start listening for webhooks
app.listen(PORT, () => {
  console.log(`🚀 Bot is listening for webhooks at: http://localhost:${PORT}/webhook`);
  console.log('💡 Remember to register this webhook URL in the Wirebot Dashboard once started!');
});
