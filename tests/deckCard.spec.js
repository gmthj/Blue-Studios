import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DeckCard from '../src/components/DeckCard.vue'

// Component + integration tests (Week 10b) for the Music page's deck

const song = {
  id: '1',
  name: 'Sunny Day',
  artist_name: 'Ana',
  duration: 120,
  waveform: JSON.stringify({ peaks: new Array(960).fill(50) }),
}

// Mount a deck with normal settings; each test changes only what it needs
function makeDeck(changes) {
  return mount(DeckCard, {
    props: {
      label: 'Deck A', color: '#0D7C75', track: null, speed: 1, volume: 80,
      playing: false, loading: false, start: 0, simple: false,
      ...changes,
    },
  })
}

describe('Component test: DeckCard', () => {
  it('Test1: shows "No song yet" and cannot play without a song', () => {
    const deck = makeDeck({})
    expect(deck.text()).toContain('No song yet')
    expect(deck.find('[aria-label="Play Deck A"]').attributes('disabled')).toBeDefined()
  })

  it('Test2: shows the song name and artist', () => {
    const deck = makeDeck({ track: song })
    expect(deck.text()).toContain('Sunny Day')
    expect(deck.text()).toContain('Ana')
  })

  it('Test3: simple mode says "Your song" and hides Speed and Cue', () => {
    const deck = makeDeck({ track: song, simple: true })
    expect(deck.text()).toContain('Your song')
    expect(deck.text()).not.toContain('Speed')
    expect(deck.text()).not.toContain('Cue')
  })

  it('Test4: the DJ booth shows the deck name, Speed and Cue', () => {
    const deck = makeDeck({ track: song, simple: false })
    expect(deck.text()).toContain('Deck A')
    expect(deck.text()).toContain('Speed')
    expect(deck.text()).toContain('Cue')
  })

  it('Test5: pressing play tells MusicView (emits toggle-play)', async () => {
    const deck = makeDeck({ track: song })
    await deck.find('[aria-label="Play Deck A"]').trigger('click')
    expect(deck.emitted('toggle-play')).toHaveLength(1)
  })

  it('Test6: while playing, the button is labelled Pause', () => {
    const deck = makeDeck({ track: song, playing: true })
    expect(deck.find('[aria-label="Pause Deck A"]').exists()).toBe(true)
  })

  it('Test7: shows the chosen 15 s part', () => {
    const deck = makeDeck({ track: song, start: 30 })
    expect(deck.text()).toContain('0:30 – 0:45')
  })

  it('Test8: moving the volume slider sends the new volume as a number', async () => {
    const deck = makeDeck({ track: song, simple: true })
    const sliders = deck.findAll('input[type="range"]') // simple mode: Start at, Volume
    await sliders[1].setValue(50)
    expect(deck.emitted('change-volume')[0]).toEqual([50])
  })
})

describe('Integration test: DeckCard + WaveformBars', () => {
  it('Test1: a song draws 60 waveform bars', () => {
    const deck = makeDeck({ track: song })
    expect(deck.findAll('.bar')).toHaveLength(60)
  })

  it('Test2: no song draws the flat empty line instead', () => {
    const deck = makeDeck({})
    expect(deck.findAll('.bar')).toHaveLength(0)
    expect(deck.find('.empty-line').exists()).toBe(true)
  })
})
