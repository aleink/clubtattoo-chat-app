/******************************************************
 * app.js (CommonJS)
 * 
 * Now uses OpenAI Assistants API with "assistant_id"
 * to direct all user messages to your custom assistant.
 * 
 * Also:
 *  1) Redirect / to /welcome.html
 *  2) Single JSON memory (#DATA snippet with "date")
 *  3) Rolling window (2 user–assistant pairs) locally
 *  4) Regex removing #DATA snippet from final text
 *  5) Polling the assistant run until "completed"
 ******************************************************/

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Telegram config (if using)
const TelegramBot = require('node-telegram-bot-api');
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;   // from .env
const telegramChatId = process.env.TELEGRAM_CHAT_ID;    // from .env
let telegramBot;
if (telegramToken) {
  telegramBot = new TelegramBot(telegramToken, { polling: false });
}

function sendTelegramMessage(text) {
  if (!telegramBot) return Promise.resolve(); // if no token, skip
  return telegramBot.sendMessage(telegramChatId, text);
}

// We'll store session data: { memory, conversation, threadId } 
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
 * 4) Assistants API Setup
 ******************************************************/
const { Configuration, OpenAIApi } = require('openai');
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(config);

// The custom assistant ID from your environment
const ASSISTANT_ID = process.env.AGENT_ID; // e.g. "asst_5UvKTAVmjYMZAK7jsWxXcyNV"

/******************************************************
 * 5) System Prompt: We'll embed instructions about 
 *    #DATA snippet at the end, etc. 
 *    (But the actual instructions are stored in your 
 *     custom assistant. This is an optional local prompt.)
 ******************************************************/
const baseSystemPrompt = `
IMPORTANT SYSTEM RULES FOR #DATA:
1. You must ALWAYS produce a #DATA snippet at the VERY END of your response, 
   separated by at least one blank line from user-facing text.
2. The user must never see #DATA. 
   Do not insert it in the middle or beginning of user text. 
   Put it after a blank line, then #DATA: {...} #ENDDATA
3. If the user finalizes, append "#FORWARD_TELEGRAM#" near the end, but never in user text.
4. Do NOT mention or refer to #DATA in your main text.
5. The #DATA snippet includes:
   {
     "name":"",
     "email":"",
     "phone":"",
     "location":"",
     "artist":"",
     "priceRange":"",
     "description":"",
     "date":"",
     "alreadyGreeted":false
   }
6. We are using the single JSON memory + rolling window approach. 
`;

/******************************************************
 * Helper: Build local system message 
 * (We can add partial instructions to override or supplement 
 *  the assistant's built-in instructions.)
 ******************************************************/
function buildLocalSystemPrompt(currentMemory) {
  const safeMemory = currentMemory || `{"name":"","email":"","phone":"","location":"","artist":"","priceRange":"","description":"","date":"","alreadyGreeted":false}`;
  return `
${baseSystemPrompt}

Current Known JSON Memory:
${safeMemory}
`.trim();
}

/******************************************************
 * 6) /chat endpoint 
 *    - Use the Assistants API (threads + runs)
 ******************************************************/
app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage) {
      return res.status(400).json({ error: 'No message provided' });
    }

    // 1) Manage session
    let sessionId = req.cookies.sessionId;
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie('sessionId', sessionId, { httpOnly: true });
    }
    if (!sessionData.has(sessionId)) {
      sessionData.set(sessionId, {
        memory: `{"name":"","email":"","phone":"","location":"","artist":"","priceRange":"","description":"","date":"","alreadyGreeted":false}`,
        conversation: [],
        threadId: null
      });
    }

    const dataObj = sessionData.get(sessionId);
    const currentMemory = dataObj.memory;
    const conversation = dataObj.conversation;
    let threadId = dataObj.threadId;

    // 2) Add user message to local conversation (rolling window)
    conversation.push({ role: 'user', content: userMessage });
    while (conversation.length > 4) {
      conversation.shift();
    }

    // 3) If no thread yet, create one
    if (!threadId) {
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      dataObj.threadId = threadId;
      console.log(`Created new thread: ${threadId} for session ${sessionId}`);
    }

    // 4) Post user message to the thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage
    });
    console.log(`Added user message to thread ${threadId}: "${userMessage}"`);

    // 5) Optionally add a local system message (like our local instructions)
    //    This is not strictly necessary if your custom assistant has all logic,
    //    but you can override or supplement instructions here if needed.
    if (baseSystemPrompt.trim()) {
      // We'll post a system message to the thread with buildLocalSystemPrompt
      const localSystemMsg = buildLocalSystemPrompt(currentMemory);
      await openai.beta.threads.messages.create(threadId, {
        role: "system",
        content: localSystemMsg
      });
      console.log(`Added local system instructions to thread ${threadId}`);
    }

    // 6) Run the assistant on this thread
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID
      // You can also pass { instructions: "...", tools: [...] } to override 
      // the assistant's default instructions or add custom tools for this run.
    });
    console.log(`Started run ${run.id} on thread ${threadId} with assistant ${ASSISTANT_ID}`);

    // 7) Poll for run completion
    let runResult;
    while (true) {
      runResult = await openai.beta.threads.runs.retrieve(threadId, run.id);
      if (runResult.status === "completed") break;
      if (runResult.status === "queued" || runResult.status === "in_progress") {
        await new Promise(r => setTimeout(r, 300)); // 0.3s delay
        continue;
      } else {
        throw new Error(`Assistant run failed or unexpected status: ${runResult.status}`);
      }
    }
    console.log(`Run completed for thread ${threadId}`);

    // 8) Retrieve the messages to find the assistant's reply
    const allMessages = await openai.beta.threads.messages.list(threadId);
    // The newest assistant message:
    // There's a chance multiple assistant messages exist, so let's find the last one with role=assistant
    const reversed = [...allMessages.data].reverse();
    const assistantMsgObj = reversed.find(m => m.role === "assistant");
    if (!assistantMsgObj) {
      throw new Error("No assistant message found in thread after run");
    }
    let aiResponse = assistantMsgObj.content || "(No response)";

    // 9) Add assistant reply to local conversation (rolling window)
    conversation.push({ role: 'assistant', content: aiResponse });
    while (conversation.length > 4) {
      conversation.shift();
    }

    // 10) Extract #DATA snippet
    const dataRegex = /#DATA:\s*({[\s\S]*?})\s*#ENDDATA\s*(#FORWARD_TELEGRAM#)?/m;
    const match = dataRegex.exec(aiResponse);
    if (match) {
      const jsonStr = match[1];
      try {
        dataObj.memory = jsonStr; // update local memory
      } catch (err) {
        console.error('Error parsing #DATA JSON:', err);
      }
      // remove #DATA snippet from user-facing text
      aiResponse = aiResponse.replace(dataRegex, '').trim();
    }

    // 11) Check for #FORWARD_TELEGRAM#
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

    // 12) Return final text
    res.json({ response: aiResponse });

  } catch (error) {
    console.error('Error with custom assistant API flow:', error);
    res.status(500).json({ error: 'Failed to get assistant response' });
  }
});

/******************************************************
 * 13) Start the Server
 ******************************************************/
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
