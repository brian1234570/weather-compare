// Weather Compare - Express server. Proxies OpenWeatherMap so the API key stays server-side.
require('dotenv').config();
const express = require('express');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min cache reduces latency and API usage
const cache = new Map();

if (!API_KEY) console.warn('WARNING: OPENWEATHER_API_KEY is not set.');

// Expose which server answered (useful for proving load balancing)
app.use((req, res, next) => {
  res.set('X-Served-By', os.hostname());
  next();
});
app.use(express.static('public'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/server', (req, res) => res.json({ host: os.hostname() }));

app.get('/api/weather', async (req, res) => {
  const city = String(req.query.city || '').trim();
  // Input validation: letters, spaces, . ' - only
  if (!/^[\p{L}\s.'-]{2,60}$/u.test(city)) {
    return res.status(400).json({ error: 'Enter a valid city name (letters only, 2-60 chars).' });
  }
  const key = city.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) {
    return res.json({ ...hit.data, cached: true });
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return res.status(404).json({ error: `City "${city}" not found.` });
    if (r.status === 401) return res.status(502).json({ error: 'Server API key invalid or not yet active.' });
    if (r.status === 429) return res.status(503).json({ error: 'API rate limit reached. Try again shortly.' });
    if (!r.ok) return res.status(502).json({ error: 'Weather service returned an error.' });
    const d = await r.json();
    const data = {
      city: d.name,
      country: d.sys?.country || '',
      temp: Math.round(d.main.temp * 10) / 10,
      feelsLike: Math.round(d.main.feels_like * 10) / 10,
      humidity: d.main.humidity,
      wind: d.wind?.speed ?? 0,
      condition: d.weather?.[0]?.description || 'n/a',
    };
    cache.set(key, { time: Date.now(), data });
    res.json({ ...data, cached: false });
  } catch (e) {
    res.status(504).json({ error: 'Weather service unreachable or timed out.' });
  }
});

app.listen(PORT, () => console.log(`Weather Compare running on port ${PORT}`));
