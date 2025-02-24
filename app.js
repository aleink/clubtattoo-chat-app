/******************************************************
 * app.js (CommonJS)
 * 
 * Features:
 *  1) Redirect / to /welcome.html
 *  2) Single JSON memory (#DATA snippet with "date")
 *  3) Rolling window (2 user–assistant pairs)
 *  4) Regex removing #DATA snippet from final text
 *  5) Strengthened system prompt instructions so snippet is at the end
 ******************************************************/

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
const agentId = process.env.AGENT_ID;


// If using Telegram
const TelegramBot = require('node-telegram-bot-api');
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;   // from .env
const telegramChatId = process.env.TELEGRAM_CHAT_ID;    // from .env
const telegramBot = new TelegramBot(telegramToken, { polling: false });

function sendTelegramMessage(text) {
  return telegramBot.sendMessage(telegramChatId, text);
}

// sessionData: sessionId -> { memory: "...", conversation: [] }
const sessionData = new Map();

/******************************************************
 * 1) Serve static from public folder
 ******************************************************/
app.use(express.static(path.join(__dirname, 'public')));

/******************************************************
 * 2) Middleware
 ******************************************************/
app.use(cookieParser());
app.use(express.json());

/******************************************************
 * 3) Redirect root (/) to /welcome.html
 ******************************************************/
app.get('/', (req, res) => {
  res.redirect('/welcome.html');
});

/******************************************************
 * 4) (Optional) Cloudinary + Multer if you use /upload
 ******************************************************/
// Uncomment if needed
/*
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: '...',
  api_key: '...',
  api_secret: '...'
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'clubtattoo_uploads',
    allowed_formats: ['jpg','jpeg','png']
  }
});
const upload = multer({ storage });

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }
  res.json({ imageUrl: req.file.path });
});
*/

/******************************************************
 * 5) The main Chat Endpoint: /chat
 ******************************************************/

// Strengthened system prompt:
const baseSystemPrompt = `
You are a booking manager named “Aitana” at **Club Tattoo**, a tattoo and piercing shop 
`;

// Helper to build the system prompt with memory
function buildSystemPrompt(currentMemory) {
  // If we have no memory, default:
  const safeMemory = currentMemory || `{"name":"","email":"","phone":"","location":"","artist":"","priceRange":"","description":"","date":"","alreadyGreeted":false}`;
  return `
${baseSystemPrompt}

Current Known JSON Memory:
${safeMemory}
`;
}

app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage) {
      return res.status(400).json({ error: 'No message provided' });
    }

    // 1) Session ID logic
    let sessionId = req.cookies.sessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie('sessionId', sessionId, { httpOnly: true });
    }

    // 2) If no session data, init
    if (!sessionData.has(sessionId)) {
      sessionData.set(sessionId, {
        memory: `{"name":"","email":"","phone":"","location":"","artist":"","priceRange":"","description":"","date":"","alreadyGreeted":false}`,
        conversation: []
      });
    }

    const dataObj = sessionData.get(sessionId);
    const currentMemory = dataObj.memory;
    const conversation = dataObj.conversation;

    // 3) Add user message
    conversation.push({ role: 'user', content: userMessage });

    // 4) Rolling window: keep last 4 messages (2 user–assistant pairs)
    while (conversation.length > 4) {
      conversation.shift();
    }

    // 5) Build system prompt
    const systemPrompt = buildSystemPrompt(currentMemory);

    // 6) finalMessages = system + short conversation
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...conversation
    ];

    // 7) Call OpenAI
    const { Configuration, OpenAIApi } = require('openai');
    const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
    const openai = new OpenAIApi(configuration);

    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: finalMessages
    });

    let aiResponse = completion.data.choices[0].message.content;

    // 8) Add assistant reply to conversation
    conversation.push({ role: 'assistant', content: aiResponse });
    while (conversation.length > 4) {
      conversation.shift();
    }

    // 9) Extract #DATA snippet
    // ensure it captures any trailing newlines
    const dataRegex = /#DATA:\s*({[\s\S]*?})\s*#ENDDATA\s*(#FORWARD_TELEGRAM#)?/m;
    const match = dataRegex.exec(aiResponse);
    if (match) {
      const jsonStr = match[1];
      try {
        dataObj.memory = jsonStr; // update memory
      } catch (err) {
        console.error('Error parsing #DATA JSON:', err);
      }
      // remove #DATA snippet from user-facing text
      aiResponse = aiResponse.replace(dataRegex, '').trim();
    }

    // 10) If #FORWARD_TELEGRAM# is present anywhere, build the summary
    if (aiResponse.includes('#FORWARD_TELEGRAM#')) {
      const cleanedResponse = aiResponse.replace('#FORWARD_TELEGRAM#', '').trim();
      try {
        const parsed = JSON.parse(dataObj.memory);
        const summary = `
Booking Summary:
Name: ${parsed.name || ""}
Email: ${parsed.email || ""}
Phone: ${parsed.phone || ""}
Location: ${parsed.location || ""}
Artist: ${parsed.artist || ""}
Price Range: ${parsed.priceRange || ""}
Description: ${parsed.description || ""}
Appointment Date: ${parsed.date || "(not specified)"}
`;

        await sendTelegramMessage(summary);

        return res.json({ response: cleanedResponse });
      } catch (err) {
        console.error('Error building Telegram summary:', err);
        return res.json({ response: aiResponse.replace('#FORWARD_TELEGRAM#', '').trim() });
      }
    }

    // 11) Return final text
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    res.status(500).json({ error: 'Failed to get response from OpenAI' });
  }
});

/******************************************************
 * 12) Start the Server
 ******************************************************/
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
