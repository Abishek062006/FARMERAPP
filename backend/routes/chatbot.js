const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const { requireAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

router.use(requireAuth);

const UZHAVAN_SYSTEM_PROMPT = `You are UZHAVAN (உழவன்), an expert AI farming assistant for Tamil Nadu farmers in India.
You are knowledgeable about:
- Crop diseases, pest control, fertilizers, organic farming
- Paddy, sugarcane, banana, mango, tomato, groundnut, cotton and all Tamil Nadu crops
- Tamil Nadu government schemes, PM-KISAN, subsidies and farmer loans
- Irrigation methods, soil health, weather-based farming decisions
- Market prices, crop selling advice and storage tips

STRICT LANGUAGE RULE:
- If the farmer writes or speaks in Tamil script reply ONLY in Tamil
- If the farmer writes or speaks in English reply ONLY in English
- If mixed language reply in both Tamil and English
- Keep answers simple, practical, and easy for farmers to understand
- Use numbered steps for procedures and treatments`;

// POST /api/chatbot/chat — proxies chat completion to OpenRouter, key stays server-side
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-saba',
        messages: [{ role: 'system', content: UZHAVAN_SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://uzhavan-farmer-app.com',
          'X-Title': 'UZHAVAN Farmer Assistant',
        },
        timeout: 30000,
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || null;
    res.json({ success: true, reply });
  } catch (err) {
    console.error('❌ Chatbot chat error:', err.response?.data || err.message);
    res.status(502).json({ success: false, error: 'Chat assistant is unavailable right now' });
  }
});

// POST /api/chatbot/transcribe — proxies voice-note transcription to OpenRouter Whisper
router.post('/transcribe', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Audio file is required' });
    }

    const formData = new FormData();
    formData.append('file', req.file.buffer, { filename: 'voice_input.m4a', contentType: 'audio/m4a' });
    formData.append('model', 'openai/whisper-large-v3');

    const response = await axios.post(
      'https://openrouter.ai/api/v1/audio/transcriptions',
      formData,
      {
        headers: { ...formData.getHeaders(), Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        timeout: 30000,
      }
    );

    res.json({ success: true, text: response.data.text?.trim() || '' });
  } catch (err) {
    console.error('❌ Chatbot transcribe error:', err.response?.data || err.message);
    res.status(502).json({ success: false, error: 'Voice transcription is unavailable right now' });
  }
});

module.exports = router;
