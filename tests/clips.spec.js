import { describe, it, expect } from 'vitest'
import { CLIP_SECONDS, MAX_EDIT_SECONDS, resolveTimeline, resolveEditedVideos, editedVideoList, newEditedVideoId } from '../src/clips.js'

// Unit tests: the timeline functions used by the Video page

// two clips, each CLIP_SECONDS (3 s) long
const clips = [{ id: 'a1', name: 'Rae' }, { id: 'b2', name: 'Gabriel' }]

describe('TestSuite: constants', () => {
  it('Test1: a clip is 3 seconds and an edited video is at most 15 seconds', () => {
    expect(CLIP_SECONDS).toBe(3)
    expect(MAX_EDIT_SECONDS).toBe(15)
  })
})

describe('TestSuite: resolveTimeline', () => {
  it('Test1: joins each timeline item with its clip, in the same order', () => {
    const entries = resolveTimeline([{ clipId: 'b2', start: 0, end: 2 }, { clipId: 'a1', start: 1, end: 3 }], clips)
    expect(entries).toHaveLength(2)
    expect(entries[0].clip).toBe(clips[1]) // b2 first, as on the timeline
    expect(entries[1].clip).toBe(clips[0])
    expect(entries[0]).toEqual({ clip: clips[1], start: 0, end: 2 })
  })

  it('Test2: a room with no timeline yet gives an empty list', () => {
    expect(resolveTimeline(undefined, clips)).toEqual([])
    expect(resolveTimeline(null, clips)).toEqual([])
    expect(resolveTimeline([], clips)).toEqual([])
  })

  it('Test3: leaves out an item whose clip no longer exists', () => {
    const entries = resolveTimeline([{ clipId: 'gone', start: 0, end: 3 }, { clipId: 'a1', start: 0, end: 3 }], clips)
    expect(entries).toHaveLength(1)
    expect(entries[0].clip.id).toBe('a1')
  })

  it('Test4: an item with no start or end uses the whole clip', () => {
    const [entry] = resolveTimeline([{ clipId: 'a1' }], clips)
    expect(entry.start).toBe(0)
    expect(entry.end).toBe(CLIP_SECONDS)
  })

  it('Test5: keeps start and end inside the clip', () => {
    const [low] = resolveTimeline([{ clipId: 'a1', start: -2, end: 2 }], clips) // start before the clip
    expect(low.start).toBe(0)
    const [high] = resolveTimeline([{ clipId: 'a1', start: 0, end: 10 }], clips) // end after the clip
    expect(high.end).toBe(CLIP_SECONDS)
  })

  it('Test6: a trim is never shorter than 0.3 seconds', () => {
    const [tiny] = resolveTimeline([{ clipId: 'a1', start: 1, end: 1.1 }], clips) // only 0.1 s long
    expect(tiny.end - tiny.start).toBeGreaterThanOrEqual(0.3 - 1e-9)
    const [late] = resolveTimeline([{ clipId: 'a1', start: 2.95, end: 3 }], clips) // start so late nothing is left
    expect(late.end - late.start).toBeGreaterThanOrEqual(0.3 - 1e-9)
    expect(late.end).toBe(CLIP_SECONDS)
  })
})

describe('TestSuite: resolveEditedVideos', () => {
  const edits = {
    e1: { name: 'Edit 1', createdAt: 100, timeline: [{ clipId: 'a1', start: 0, end: 2 }, { clipId: 'b2', start: 1, end: 3 }] },
  }

  it('Test1: gives each saved edit its name, its clips and its length', () => {
    const result = resolveEditedVideos(edits, clips)
    expect(result.e1.id).toBe('e1')
    expect(result.e1.name).toBe('Edit 1')
    expect(result.e1.entries).toHaveLength(2)
    expect(result.e1.seconds).toBe(4) // (2 - 0) + (3 - 1)
  })

  it('Test2: no saved edits gives an empty object', () => {
    expect(resolveEditedVideos(undefined, clips)).toEqual({})
    expect(resolveEditedVideos({}, clips)).toEqual({})
  })

  it('Test3: the length only counts clips that still exist', () => {
    const result = resolveEditedVideos(edits, [clips[0]]) // b2 was deleted
    expect(result.e1.entries).toHaveLength(1)
    expect(result.e1.seconds).toBe(2)
  })

  it('Test4: an edit saved without a timeline is empty, not an error', () => {
    const result = resolveEditedVideos({ e2: { name: 'Empty', createdAt: 5 } }, clips)
    expect(result.e2.timeline).toEqual([])
    expect(result.e2.entries).toEqual([])
    expect(result.e2.seconds).toBe(0)
  })
})

describe('TestSuite: editedVideoList', () => {
  it('Test1: lists the saved edits oldest first', () => {
    const list = editedVideoList(
      {
        late: { name: 'Edit 3', createdAt: 300, timeline: [] },
        early: { name: 'Edit 1', createdAt: 100, timeline: [] },
        middle: { name: 'Edit 2', createdAt: 200, timeline: [] },
      },
      clips
    )
    expect(list.map((e) => e.name)).toEqual(['Edit 1', 'Edit 2', 'Edit 3'])
  })

  it('Test2: no saved edits gives an empty list', () => {
    expect(editedVideoList(undefined, clips)).toHaveLength(0)
  })
})

describe('TestSuite: newEditedVideoId', () => {
  it('Test1: makes a different id every time, without needing the internet', () => {
    const ids = new Set()
    for (let i = 0; i < 50; i++) ids.add(newEditedVideoId())
    expect(ids.size).toBe(50)
    for (const id of ids) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })
})
