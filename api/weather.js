// Vercel serverless function: GET /api/weather?city=Singapore
//                         or: GET /api/weather?lat=1.35&lon=103.82
// Returns { city, country, temp, description, condition } for the live weather and
// location stickers.
//
// This runs on Vercel's server, not in the browser, so the OpenWeatherMap key (small free
// quota) is never copied into the JavaScript that every visitor downloads.
// Same pattern as api/remove-bg.js, except guests may use it too (Gabriel's guide), so
// there is no account check. The input is checked instead, and answers are cached.

// WHY these limits: a city is letters (any language), spaces and a few marks, never a URL
// or a script. Anything else is refused before it reaches OpenWeatherMap.
const CITY_PATTERN = /^[\p{L} .,'-]{1,60}$/u

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // The key comes from Vercel's environment variables, with no VITE_ prefix, so it stays secret.
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    console.error('OPENWEATHER_API_KEY is not set')
    return res.status(500).json({ error: 'Weather is not available' })
  }

  const params = new URLSearchParams({ appid: apiKey, units: 'metric' })
  const city = String(req.query.city || '').trim()
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)

  if (city) {
    if (!CITY_PATTERN.test(city)) {
      return res.status(400).json({ error: 'Type a city name, like Singapore' })
    }
    params.set('q', city)
  } else if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    // WHY round to 2 decimals (about 1 km): enough to find the city, and the cache below
    // then shares one answer between everyone nearby instead of one per exact spot.
    params.set('lat', lat.toFixed(2))
    params.set('lon', lon.toFixed(2))
  } else {
    return res.status(400).json({ error: 'Give a city or a location' })
  }

  try {
    const response = await fetch('https://api.openweathermap.org/data/2.5/weather?' + params.toString())
    if (response.status === 404) {
      return res.status(404).json({ error: 'We could not find that city' })
    }
    if (!response.ok) {
      console.error('OpenWeatherMap error', response.status, await response.text()) // details in the Vercel logs only
      return res.status(502).json({ error: 'Could not get the weather' })
    }
    const data = await response.json()
    const weather = (data.weather && data.weather[0]) || {}

    // WHY cache for 10 minutes: weather does not change faster than that, and every
    // sticker in every room asking OpenWeatherMap directly would use up the free quota.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300')
    return res.status(200).json({
      city: data.name || city,
      country: (data.sys && data.sys.country) || '',
      temp: Math.round(data.main ? data.main.temp : 0),
      description: weather.description || '',
      condition: weather.main || 'Clear', // Clear, Clouds, Rain, Drizzle, Thunderstorm, Snow, Mist...
    })
  } catch (error) {
    console.error('Weather request failed', error)
    return res.status(502).json({ error: 'Could not get the weather' })
  }
}
