const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// Simple rate limiting: max 10 requests per IP per minute
const requests = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const window = 60_000;
  const max = 10;

  const hits = (requests.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= max) {
    return res.status(429).json({ error: 'Too many requests — please wait a moment.' });
  }
  hits.push(now);
  requests.set(ip, hits);
  next();
}

// Health check
app.get('/', (req, res) => res.json({ status: 'EngPath API is running' }));

// Proxy endpoint — receives a prompt, calls Gemini, returns the text
app.post('/api/map', rateLimit, async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid request body — expected { prompt: string }.' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.2 }
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({ text });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error — please try again.' });
  }
});

app.listen(PORT, () => console.log(`EngPath backend running on port ${PORT}`));
