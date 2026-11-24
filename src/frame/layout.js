import { designBase, sockets } from './base.js'
import { calculate, strandAngle } from '../model.js'

export const hardware = {
  od: 29.54,
  clearance: 0.3,
  cord: 3.2,
  ball: 21.5,
  loop: 130,
  bed: 256,
  reach: 50,
  topReach: 50,
}
export function savedHardware() {
  try {
    const current = localStorage.getItem('tree-frame-direct-wrap')
    if (current) return { ...hardware, ...JSON.parse(current) }
    // Keep measured hardware from older kits. The new reach is measured to the rail axis.
    const previous = JSON.parse(
      localStorage.getItem('tree-frame-hardware') || '{}',
    )
    const result = { ...hardware }
    for (const name of ['od', 'clearance', 'cord', 'ball', 'loop', 'bed'])
      if (Number.isFinite(previous?.[name])) result[name] = previous[name]
    return result
  } catch {
    return { ...hardware }
  }
}
const tau = 2 * Math.PI
export const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const mod = (x, m) => ((x % m) + m) % m
function check(condition, message) {
  if (!condition) throw Error(message)
}

// Rotate all radial seams together to leave the largest ligament beside every bore.
function splitPhase(points, count, margin) {
  let phase = 0,
    best = -Infinity
  for (let i = 0; i < 1440; i++) {
    const start = ((tau / count) * i) / 1440
    const clearance = Math.min(
      ...points.map(([x, y]) => {
        const sector = tau / count
        const angle = mod(Math.atan2(y, x) - start, sector)
        return Math.hypot(x, y) * Math.sin(Math.min(angle, sector - angle))
      }),
    )
    if (clearance > best) {
      phase = start
      best = clearance
    }
  }
  check(
    best >= margin,
    'Panel seams would cross mounting holes. Change the diameter or the number of strips or star pixels.',
  )
  return phase
}
// A two-piece star can miss every LED by shifting its straight joint slightly off-centre.
function starSeam(points, sections, margin) {
  if (sections === 1) return { phase: 0, offset: 0 }
  if (sections !== 2)
    return { phase: splitPhase(points, sections, margin), offset: 0 }
  for (let offset = 0; offset <= 14; offset += 0.5) {
    for (let i = 0; i < 720; i++) {
      const phase = (i * Math.PI) / 720
      if (
        points.every(
          ([x, y]) =>
            Math.abs(y * Math.cos(phase) - x * Math.sin(phase) - offset) >=
            margin,
        )
      )
        return { phase, offset }
    }
  }
  throw Error(
    'A star seam crosses pixel holes. Enlarge the star or reduce the pixel count.',
  )
}
export function frameLayout(p, f = hardware) {
  const m = calculate(p),
    baseR = p.base * 12.7,
    topR = p.top * 12.7
  const holeStep = p.holePitch * 25.4,
    gap = f.reach
  check(
    m.onPitch,
    'Choose a pixel spacing that lands on the punched strip holes.',
  )
  check(
    f.od >= 28 && f.od <= 31.5 && f.clearance >= 0.15 && f.clearance <= 1.5,
    'The connector fits conduit from 28 to 31.5 mm OD with 0.15–1.5 mm diametral clearance.',
  )
  check(
    f.cord >= 2 &&
      f.cord <= 4.5 &&
      f.ball > 2 * f.cord + 6 &&
      f.loop > 0 &&
      gap > 27,
    'Check the ball, cord, loop and installed reach dimensions.',
  )
  check(
    p.holeDiameter >= 11 &&
      p.holeDiameter <= 14 &&
      p.stripWidth * 25.4 < 44 &&
      holeStep >= 15 &&
      p.thickness * 25.4 < 4,
    'The strip and pixel hardware require 11–14 mm mounting holes, under 44 mm strip width, under 4 mm thickness and at least 15 mm hole pitch.',
  )
  check(
    baseR > 100 && topR > 0 && topR < baseR,
    'The base must exceed 200 mm across and be wider than the requested crown.',
  )
  check(
    p.strands >= 2 && p.strands <= 200 && Number.isInteger(p.strands),
    'Choose between 2 and 200 strip runs.',
  )
  const base = designBase(p, f, baseR)
  const step = strandAngle(p, 1) - strandAngle(p, 0)
  const smallestGap =
    p.angle === 360
      ? step
      : Math.min(step, 2 * Math.PI - (p.angle * Math.PI) / 180)
  const ends = Math.max(1, Math.ceil(p.tail / p.holePitch - 1e-9))
  const strip = (m.perStrand - 1) * p.pitch * 25.4 + 2 * ends * holeStep
  const slotWidth = f.cord + 1.8,
    slotLength = 2 * f.cord + 2.4
  const slotRadius = topR - 6 - slotWidth / 2
  check(
    slotRadius - slotWidth / 2 > 26 && topR < base.wrapR,
    'The crown must clear the mast collar and fit inside the base wrap circle.',
  )
  check(
    2 * slotRadius * Math.sin(smallestGap / 2) > slotLength + 3,
    'Crown slots leave too little plastic between them. Enlarge the crown or use fewer strips.',
  )
  check(
    Number.isFinite(f.topReach) && f.topReach > holeStep / 2 + f.cord + 3,
    'The top bungee reach must clear the strip tail.',
  )
  const span = strip + gap + f.topReach
  const rise = Math.sqrt(span ** 2 - (base.wrapR - topR) ** 2)
  check(
    Number.isFinite(rise) && rise > 170,
    'The current strips cannot span the frame.',
  )
  check(
    2 * f.cord + 0.8 < p.holeDiameter && f.ball > p.holeDiameter + 1,
    'The doubled cord must fit the strip hole and the ball must seat against it.',
  )
  const slope = (base.wrapR - topR) / rise
  const upperHoleR = topR + (f.topReach * (base.wrapR - topR)) / span
  const ballCircle =
    upperHoleR + ((f.ball / 2 + p.thickness * 12.7) * rise) / span
  check(
    2 * ballCircle * Math.sin(smallestGap / 2) > f.ball + 0.5,
    'Adjacent upper bungee balls touch. Increase the top reach or crown diameter, or reduce the strip count.',
  )
  const firstLedR = upperHoleR + (ends * holeStep * (base.wrapR - topR)) / span
  check(
    2 * firstLedR * Math.sin(smallestGap / 2) > 15.5,
    'Adjacent bullet pixel collars touch. Increase the top reach or crown diameter.',
  )
  const crown = Array.from({ length: p.strands }, (_, i) =>
    polar(slotRadius, strandAngle(p, i)),
  )
  const crownSections =
    2 * topR <= f.bed - 2 ? 1 : topR * (1 + Math.SQRT1_2) <= f.bed - 2 ? 2 : 4
  const crownPhase =
    crownSections === 1
      ? 0
      : splitPhase(crown, crownSections, slotLength / 2 + 2)
  check(
    crownSections === 1 || slotRadius - slotWidth / 2 > 51,
    'The collar blocks these slots. Use a larger print bed or crown.',
  )
  const runs = base.runs.map((r) => ({ ...r, reach: gap }))
  let star
  if (p.star) {
    check(
      p.starPixels >= 5 &&
        p.starPixels <= 300 &&
        Number.isInteger(p.starPixels),
      'Choose 5–300 star pixels for the printable star.',
    )
    const rim = p.holeDiameter / 2 + 4
    const R = (p.starWidth * 25.4 - 2 * rim) / (2 * Math.cos(Math.PI / 10))
    const vertices = Array.from({ length: 10 }, (_, i) =>
      polar(R * (i % 2 ? 0.44 : 1), Math.PI / 2 + (i * tau) / 10),
    )
    const lights = Array.from({ length: p.starPixels }, (_, i) => {
      const t = (i * 10) / p.starPixels,
        k = Math.floor(t),
        s = t - k
      return vertices[k].map(
        (v, d) => v * (1 - s) + vertices[(k + 1) % 10][d] * s,
      )
    })
    check(
      0.44 * R >= 40,
      'Enlarge the star to clear the mast socket behind the pixels.',
    )
    for (let i = 0; i < lights.length; i++)
      for (let j = 0; j < i; j++)
        check(
          distance(lights[i], lights[j]) > p.holeDiameter + 2,
          'Star pixel holes overlap. Increase star width or reduce its pixel count.',
        )
    const sections =
      p.starWidth * 25.4 <= f.bed - 2
        ? 1
        : p.starWidth * 25.4 <= 1.32 * (f.bed - 2)
          ? 2
          : 5
    star = {
      sections,
      screwRadius: Math.min(32, 0.44 * R - p.holeDiameter / 2 - 10),
      vertices,
      lights,
      rim,
      ...starSeam(lights, sections, p.holeDiameter / 2 + 2),
      riser: Math.max(...vertices.map((v) => -v[1])) + rim + 32 + 19,
    }
  }
  return {
    m,
    baseR,
    topR,
    crown,
    base,
    slope,
    slotRadius,
    slotLength,
    slotWidth,
    span,
    upperHoleR,
    smallestGap,
    crownPhase,
    crownSections,

    runs,
    star,
    ends,
    strip,
    cut: strip + holeStep,

    rise,
    // The mast seats 20 mm above the rail axes.
    // With the star, its blind socket stops 2 mm below the star centre.
    mast:
      sockets.axisHeight +
      rise -
      (sockets.axisHeight + 20) +
      (star ? star.riser - 3 : 28),
  }
}
