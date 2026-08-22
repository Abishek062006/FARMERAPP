const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Groq, toFile } = require('groq-sdk');
const { requireAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

let groq = null;
function getGroqClient() {
  if (!groq) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not found in environment variables');
    groq = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groq;
}

router.use(requireAuth);

const UZHAVAN_SYSTEM_PROMPT = `You are UZHAVAN (உழவன்), an expert AI farming assistant for Tamil Nadu farmers in India.
You are knowledgeable about:
- Crop diseases, pest control, fertilizers, organic farming
- Paddy, sugarcane, banana, mango, tomato, groundnut, cotton and all Tamil Nadu crops
- Tamil Nadu government schemes, PM-KISAN, subsidies and farmer loans
- Irrigation methods, soil health, weather-based farming decisions
- Market prices, crop selling advice and storage tips

You ONLY answer questions related to farming and agriculture. If the farmer asks about
anything else, politely reply (in the same language they used) that you can only help
with farming-related questions.

STRICT LANGUAGE RULE:
- If the farmer writes or speaks in Tamil script reply ONLY in Tamil
- If the farmer writes or speaks in English reply ONLY in English
- If mixed language reply in both Tamil and English
- Keep answers simple, practical, and easy for farmers to understand
- Use numbered steps for procedures and treatments`;

// POST /api/chatbot/chat — proxies chat completion to Groq (free tier), key stays server-side
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const client = getGroqClient();
    const completion = await client.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: UZHAVAN_SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = completion.choices?.[0]?.message?.content || null;
    res.json({ success: true, reply });
  } catch (err) {
    console.error('❌ Chatbot chat error:', err.message);
    res.status(502).json({ success: false, error: 'Chat assistant is unavailable right now' });
  }
});

// POST /api/chatbot/transcribe — proxies voice-note transcription to Groq's Whisper (free tier)
router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required' });
    }

    const client = getGroqClient();
    const file = await toFile(req.file.buffer, 'voice_input.m4a');
    const transcription = await client.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
    });

    res.json({ success: true, text: transcription.text?.trim() || '' });
  } catch (err) {
    console.error('❌ Chatbot transcribe error:', err.message);
    res.status(502).json({ success: false, error: 'Voice transcription is unavailable right now' });
  }
});

module.exports = router;
