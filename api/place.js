// Vercel serverless function: GET /api/place?q=SMU&near=sg
//                         or: GET /api/place?lat=1.2966&lon=103.8497
// Returns { results: [{ names, summary, country, lat, lon }] } for the live location sticker.
// "names" runs from the most specific to the widest, e.g. ['SMU', 'Singapore Management
// University', 'Bras Basah', 'Singapore'], so the person can pick how much to show.
// A search can match more than one place (Jurong East, Jurong West...), so up to 5 come back.
//
// WHY OpenStreetMap and not OpenWeatherMap: OpenWeatherMap only knows cities. OpenStreetMap
// knows landmarks (SMU) and neighbourhoods (Jurong West), and needs no key. Two of its free
// services are used:
//   Nominatim: finds a place by name, and names the area around a position.
//   Overpass:  lists the named places a position is INSIDE (a campus, a mall, a park).
//              Nominatim alone only finds the nearest point, which at SMU is a signpost.
// WHY on the server: both services ask every app to say who it is (USER_AGENT) and to cache
// answers. Vercel caches each answer for a day (Cache-Control), so a place is looked up once.
// https://operations.osmfoundation.org/policies/nominatim/

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'BlueStudiosPhotobooth/1.0 (SMU IS216 student project)'

// A place name: letters in any language, numbers (for "Block 123"), spaces and a few marks.
const QUERY_PATTERN = /^[\p{L}\p{N} .,'&()-]{1,80}$/u

// Kinds of OpenStreetMap result whose own name is not worth showing (a road or a house number).
const SKIP_NAME = ['highway', 'building', 'landuse', 'information']

// Kinds of area that count as a landmark, best first (a university before the lawn inside it).
const LANDMARK_KEYS = ['amenity', 'tourism', 'shop', 'historic', 'aeroway', 'leisure', 'building']

function addName(names, name) {
  const clean = String(name || '').trim()
  // 40 is what a sticker can show; skip repeats and anything that is only numbers.
  if (clean && clean.length <= 40 && !/^\d+$/.test(clean) && !names.includes(clean)) names.push(clean)
}

// The areas around a Nominatim result: the neighbourhood, then wider, up to the city.
function areaNames(address, names) {
  for (const key of ['neighbourhood', 'quarter', 'suburb', 'city_district', 'town', 'village', 'city', 'state']) {
    addName(names, address[key])
  }
}

// One Nominatim result -> { names, summary, country, lat, lon }
function toResult(result, landmarks = []) {
  const address = result.address || {}
  const named = result.namedetails || {}
  const names = []
  landmarks.forEach((name) => addName(names, name))
  addName(names, named.short_name) // "SMU"
  if (!SKIP_NAME.includes(result.category)) addName(names, named['name:en'] || named.name || result.name)
  areaNames(address, names)
  const country = String(address.country_code || '').toUpperCase().slice(0, 2)
  return {
    names: names.slice(0, 6),
    // A short line to tell matches apart: "Jurong East · Singapore"
    summary: [names[0], address.city || address.state || address.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '),
    country,
    // Rounded to about 1 km: only used to ask for the weather there.
    lat: Number(Number(result.lat).toFixed(2)),
    lon: Number(Number(result.lon).toFixed(2)),
  }
}

async function nominatim(path, params) {
  const response = await fetch(NOMINATIM + path + '?' + new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', namedetails: '1', ...params,
  }), { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } })
  if (!response.ok) throw new Error('Nominatim ' + response.status + ' ' + await response.text())
  return response.json()
}

// Named landmarks the position is inside. A bonus, not a must: the public Overpass server is
// free and often busy (in testing it answered in 1 s, then failed, then took 38 s). So it gets
// 4 seconds, and if it has not answered by then the sticker just uses Nominatim's area names.
async function landmarksAt(lat, lon) {
  const query = '[out:json][timeout:4];is_in(' + lat + ',' + lon + ')->.a;(way(pivot.a)[name];rel(pivot.a)[name];);out tags;'
  try {
    const response = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) return []
    const data = await response.json()
    const found = []
    for (const key of LANDMARK_KEYS) {
      for (const element of data.elements || []) {
        const tags = element.tags || {}
        if (!tags[key] || tags.boundary) continue
        addName(found, tags.short_name)
        addName(found, tags['name:en'] || tags.name)
      }
    }
    return found.slice(0, 3)
  } catch (error) {
    console.warn('Overpass did not answer in time, using area names only')
    return []
  }
}

// How well known a result is (0 to 1). A city or a famous place scores high, a shop low.
const importance = (result) => Number(result && result.importance) || 0

async function search(query, near) {
  // WHY search near the person first: "SMU" is also a university in Texas, and "Jurong" a
  // town in China. Their own country's matches come first...
  let local = []
  if (near) local = await nominatim('/search', { q: query, countrycodes: near, limit: '5' })
  // ...unless nothing there matches well (a person in Singapore typing "Tokyo" gets restaurants
  // called Tokyo). Then search the whole world too.
  let world = []
  if (local.length === 0 || importance(local[0]) < 0.2) {
    if (near) await new Promise((resolve) => setTimeout(resolve, 1000)) // Nominatim: 1 request a second
    world = await nominatim('/search', { q: query, limit: '5' })
  }
  // A much better-known match elsewhere wins (Tokyo the city beats Tokyo Ramen).
  const ordered = world[0] && (!local[0] || importance(world[0]) > importance(local[0]) + 0.3)
    ? [...world, ...local]
    : [...local, ...world]
  const seen = new Set()
  return ordered.filter((result) => !seen.has(result.place_id) && seen.add(result.place_id)).slice(0, 5)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const query = String(req.query.q || '').trim()
  const near = /^[a-z]{2}$/i.test(String(req.query.near || '')) ? String(req.query.near).toLowerCase() : ''
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)

  try {
    let results
    if (query) {
      if (!QUERY_PATTERN.test(query)) {
        return res.status(400).json({ error: 'Type a place name, like SMU or Jurong' })
      }
      results = (await search(query, near)).map((result) => toResult(result))
    } else if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      // WHY 4 decimals (about 10 m): enough to tell which building you are in, which is the
      // point of a landmark sticker. Never stored, and the answer only holds 2 decimals.
      const exactLat = lat.toFixed(4)
      const exactLon = lon.toFixed(4)
      const [area, landmarks] = await Promise.all([
        nominatim('/reverse', { lat: exactLat, lon: exactLon, zoom: '18' }),
        landmarksAt(exactLat, exactLon),
      ])
      results = area && !area.error ? [toResult(area, landmarks)] : []
    } else {
      return res.status(400).json({ error: 'Give a place or a location' })
    }

    results = results.filter((result) => result.names.length > 0)
    if (results.length === 0) {
      return res.status(404).json({ error: query ? 'We could not find that place' : 'That spot has no name on the map. Try typing a place.' })
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.status(200).json({ results })
  } catch (error) {
    console.error('Place lookup failed', error) // details in the Vercel logs only
    return res.status(502).json({ error: 'Could not look up that place. Try again in a moment.' })
  }
}
