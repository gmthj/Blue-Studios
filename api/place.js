// Vercel serverless function: GET /api/place?q=SMU&near=sg
//                         or: GET /api/place?lat=1.2966&lon=103.8497
// Returns { results: [{ names, summary, country, lat, lon }], nearby: [...] } for the live
// location sticker.
// "names" runs from the most specific to the widest, e.g. ['SMU', 'Singapore Management
// University', 'Bras Basah', 'Singapore'], so the person can pick how much to show.
// A search can match more than one place (Jurong East, Jurong West...), so up to 5 come back.
// A position also gets "nearby": landmarks around you, closest first, e.g.
// { name: 'National Museum of Singapore', kind: 'Museum', distance: 154 } (metres).
//
// WHY OpenStreetMap and not OpenWeatherMap: OpenWeatherMap only knows cities. OpenStreetMap
// knows landmarks (SMU) and neighbourhoods (Jurong West), and needs no key. Two free
// services read it:
//   Nominatim: finds a place by name, and names the area around a position.
//   Photon:    lists the landmarks around a position (museums, schools, malls, stations).
//              Nominatim alone only finds the single nearest point, which at SMU is a signpost.
// WHY on the server: both services ask every app to say who it is (USER_AGENT) and to cache
// answers. Vercel caches each answer for a day (Cache-Control), so a place is looked up once.
// https://operations.osmfoundation.org/policies/nominatim/  https://photon.komoot.io

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const PHOTON = 'https://photon.komoot.io'
const USER_AGENT = 'BlueStudiosPhotobooth/1.0 (SMU IS216 student project)'

// A place name: letters in any language, numbers (for "Block 123"), spaces and a few marks.
const QUERY_PATTERN = /^[\p{L}\p{N} .,'&()-]{1,80}$/u

// Kinds of OpenStreetMap result whose own name is not worth showing (a road or a house number).
const SKIP_NAME = ['highway', 'building', 'landuse', 'information']

// The kinds of place worth putting on a sticker, and the word shown next to each in the list.
// WHY a list: around SMU, the nearest named things are trees, ATMs, bus stops and footpaths.
// Asking Photon for these kinds only gives museums, schools, malls and stations instead.
const LANDMARK_KINDS = {
  'tourism': 'Attraction',
  'tourism:museum': 'Museum',
  'tourism:gallery': 'Gallery',
  'tourism:hotel': 'Hotel',
  'tourism:zoo': 'Zoo',
  'tourism:theme_park': 'Theme park',
  'historic': 'Historic site',
  'amenity:university': 'University',
  'amenity:college': 'School',
  'amenity:school': 'School',
  'amenity:library': 'Library',
  'amenity:arts_centre': 'Arts centre',
  'amenity:theatre': 'Theatre',
  'amenity:cinema': 'Cinema',
  'amenity:place_of_worship': 'Place of worship',
  'amenity:hospital': 'Hospital',
  'amenity:marketplace': 'Market',
  'amenity:food_court': 'Food court',
  'leisure:park': 'Park',
  'leisure:garden': 'Garden',
  'leisure:stadium': 'Stadium',
  'landuse:recreation_ground': 'Park',
  'shop:mall': 'Mall',
  'shop:department_store': 'Mall',
  'railway:station': 'Station',
  'aeroway:aerodrome': 'Airport',
  'building': 'Building',
}
// Inside those kinds, the ones that are not places you would say you are "at".
const NOT_A_PLACE = ['tourism:artwork', 'tourism:information', 'historic:memorial', 'historic:boundary_stone']

// Straight-line distance in metres (good enough for "154 m away").
function metresBetween(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(a)))
}

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
function toResult(result) {
  const address = result.address || {}
  const named = result.namedetails || {}
  const names = []
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

// Landmarks within 1 km, closest first: [{ name, kind, distance }]. A bonus, not a must: if
// Photon is slow or down, the person still gets the area names from Nominatim.
async function landmarksNear(lat, lon) {
  const params = new URLSearchParams({ lat, lon, limit: '50', radius: '1', lang: 'en' })
  Object.keys(LANDMARK_KINDS).forEach((kind) => params.append('osm_tag', kind))
  try {
    const response = await fetch(PHOTON + '/reverse?' + params.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return []
    const data = await response.json()
    const found = []
    for (const feature of data.features || []) {
      const info = feature.properties || {}
      const kind = info.osm_key + ':' + info.osm_value
      const name = String(info.name || '').trim()
      // Skip artworks and plaques, names a sticker cannot fit, and repeats (a school is often
      // mapped twice: once as the college, once as its building).
      if (!name || name.length > 40 || NOT_A_PLACE.includes(kind) || found.some((place) => place.name === name)) continue
      const [placeLon, placeLat] = feature.geometry.coordinates
      found.push({
        name,
        kind: LANDMARK_KINDS[kind] || LANDMARK_KINDS[info.osm_key] || 'Place',
        distance: metresBetween(Number(lat), Number(lon), placeLat, placeLon),
      })
    }
    return found.sort((a, b) => a.distance - b.distance).slice(0, 20)
  } catch (error) {
    console.warn('Photon did not answer in time, using area names only')
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
  return ordered.filter((result) => !seen.has(result.place_id) && seen.add(result.place_id))
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
    let nearby = []
    if (query) {
      if (!QUERY_PATTERN.test(query)) {
        return res.status(400).json({ error: 'Type a place name, like SMU or Jurong' })
      }
      results = (await search(query, near)).map((result) => toResult(result))
    } else if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      // WHY 4 decimals (about 10 m): enough to tell which building you are in and how far
      // each landmark is. Never stored, and the answer holds no coordinates finer than 2 decimals.
      const exactLat = lat.toFixed(4)
      const exactLon = lon.toFixed(4)
      const [area, landmarks] = await Promise.all([
        nominatim('/reverse', { lat: exactLat, lon: exactLon, zoom: '18' }),
        landmarksNear(exactLat, exactLon),
      ])
      results = area && !area.error ? [toResult(area)] : []
      nearby = landmarks
    } else {
      return res.status(400).json({ error: 'Give a place or a location' })
    }

    // Two matches that would look the same in the list ("Bras Basah · Singapore" twice) are one.
    const shown = new Set()
    results = results
      .filter((result) => result.names.length > 0 && !shown.has(result.summary) && shown.add(result.summary))
      .slice(0, 5)
    if (results.length === 0 && nearby.length === 0) {
      return res.status(404).json({ error: query ? 'We could not find that place' : 'That spot has no name on the map. Try typing a place.' })
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600')
    return res.status(200).json({ results, nearby })
  } catch (error) {
    console.error('Place lookup failed', error) // details in the Vercel logs only
    return res.status(502).json({ error: 'Could not look up that place. Try again in a moment.' })
  }
}
