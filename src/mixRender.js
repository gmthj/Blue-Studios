import * as Tone from 'tone'
import { MAX_EDIT_SECONDS } from './clips.js'   // the MP4's length, so the mix always matches the video

// Renders the mix (as long as the exported video) into a WAV file (a Blob) WITHOUT playing it out loud.
// settings.bufferA / bufferB are the loaded songs (player.buffer from MusicView), or null for an empty deck.
export async function renderMix(settings) {
  const seconds = MAX_EDIT_SECONDS

  // Tone.Offline builds the same sound path as the live mixer, but records it instead of playing it
  const rendered = await Tone.Offline(function () {
    const crossFade = new Tone.CrossFade(settings.crossfade).toDestination()
    const gainA = new Tone.Gain(settings.volumeA / 100).connect(crossFade.a)
    const gainB = new Tone.Gain(settings.volumeB / 100).connect(crossFade.b)

    if (settings.bufferA) {
      const playerA = new Tone.Player(settings.bufferA).connect(gainA)
      playerA.playbackRate = settings.speedA
      playerA.start(0, settings.startA || 0)   // from the chosen part (0 if no start was given)
    }
    if (settings.bufferB) {
      const playerB = new Tone.Player(settings.bufferB).connect(gainB)
      playerB.playbackRate = settings.speedB
      playerB.start(0, settings.startB || 0)
    }
  }, seconds)

  return audioBufferToWav(rendered.get())
}

// Standard recipe (not in syllabus): a WAV file is a 44-byte header followed by the raw sound numbers.
function audioBufferToWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels
  const length = audioBuffer.length
  const sampleRate = audioBuffer.sampleRate
  const dataSize = length * channels * 2   // 2 bytes per sample

  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  function writeText(offset, text) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)                      // 1 = normal (PCM) audio
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)                     // 16 bits per sample
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  // Write every sample, left and right side by side
  const channelData = []
  for (let ch = 0; ch < channels; ch++) {
    channelData.push(audioBuffer.getChannelData(ch))
  }
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      // keep the value between -1 and 1, then turn it into a whole number
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}