import type { InspectedLocalSource } from './mediaDockApi'

export type LocalAvPairMatch = Readonly<{
  video: InspectedLocalSource
  audio: InspectedLocalSource
  durationDifferenceSeconds: number
  startTimeDifferenceSeconds: number | null
}>

export type LocalAvPairingResult = Readonly<{
  pairs: readonly LocalAvPairMatch[]
  unmatched: readonly InspectedLocalSource[]
}>

type Candidate = Readonly<{
  video: InspectedLocalSource
  audio: InspectedLocalSource
  durationDifferenceSeconds: number
  startTimeDifferenceSeconds: number | null
  score: number
}>

function candidateFor(video: InspectedLocalSource, audio: InspectedLocalSource): Candidate | null {
  if (video.durationSeconds === null || audio.durationSeconds === null) return null
  const durationDifferenceSeconds = Math.abs(video.durationSeconds - audio.durationSeconds)
  const durationTolerance = Math.max(1.5, Math.max(video.durationSeconds, audio.durationSeconds) * 0.02)
  if (durationDifferenceSeconds > durationTolerance) return null

  const hasBothStartTimes = typeof video.startTimeSeconds === 'number' && typeof audio.startTimeSeconds === 'number'
  const startTimeDifferenceSeconds = hasBothStartTimes
    ? Math.abs(video.startTimeSeconds! - audio.startTimeSeconds!)
    : null
  if (startTimeDifferenceSeconds !== null && startTimeDifferenceSeconds > 1.5) return null

  return Object.freeze({
    video,
    audio,
    durationDifferenceSeconds,
    startTimeDifferenceSeconds,
    score: durationDifferenceSeconds + (startTimeDifferenceSeconds ?? 0) * 2,
  })
}

function isUnambiguous(candidates: readonly Candidate[]): boolean {
  if (candidates.length <= 1) return true
  const [best, second] = [...candidates].sort((left, right) => left.score - right.score)
  if (!best || !second) return true
  return second.score - best.score >= Math.max(0.35, best.score * 0.25)
}

export function matchLocalAvSources(sources: readonly InspectedLocalSource[]): LocalAvPairingResult {
  const remainingVideos = new Set(sources.filter((source) => source.mediaKind === 'video'))
  const remainingAudios = new Set(sources.filter((source) => source.mediaKind === 'audio'))
  const pairs: LocalAvPairMatch[] = []

  let matchedInPass = true
  while (matchedInPass) {
    matchedInPass = false
    const candidates = [...remainingVideos].flatMap((video) => [...remainingAudios]
      .map((audio) => candidateFor(video, audio))
      .filter((candidate): candidate is Candidate => candidate !== null))

    for (const video of remainingVideos) {
      const videoCandidates = candidates.filter((candidate) => candidate.video === video).sort((left, right) => left.score - right.score)
      const best = videoCandidates[0]
      if (!best || !isUnambiguous(videoCandidates)) continue
      const audioCandidates = candidates.filter((candidate) => candidate.audio === best.audio).sort((left, right) => left.score - right.score)
      if (audioCandidates[0]?.video !== video || !isUnambiguous(audioCandidates)) continue

      pairs.push(Object.freeze({
        video,
        audio: best.audio,
        durationDifferenceSeconds: best.durationDifferenceSeconds,
        startTimeDifferenceSeconds: best.startTimeDifferenceSeconds,
      }))
      remainingVideos.delete(video)
      remainingAudios.delete(best.audio)
      matchedInPass = true
      break
    }
  }

  return Object.freeze({
    pairs: Object.freeze(pairs),
    unmatched: Object.freeze(sources.filter((source) => remainingVideos.has(source) || remainingAudios.has(source) || source.mediaKind === 'unknown')),
  })
}
