// Work in the horizontal CAD plane, in millimetres. Each loaded face touches
// the same circle at one strip, or intersects it at a symmetric pair of strips.
import { strandAngle } from '../model.js'
const tau = 2 * Math.PI
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const length = (a) => Math.hypot(...a)
const mod = (n, d) => ((n % d) + d) % d
const bearing = ([x, y]) => Math.atan2(y, x)
export const sockets = {
  railStop: 8,
  spokeStop: 30,
  spokeMouth: 55,
  parkingClearance: 2,
  sleeve: 40,
  jointGap: 1,
  axisHeight: 23,
}
export function designBase(p, f, radius) {
  const first = strandAngle(p, 0),
    step = strandAngle(p, 1) - first
  const possible = Math.PI / step,
    count = Math.round(possible)
  const paired = count >= 3 && count <= 200 && Math.abs(count - possible) < 1e-7
  const normals = []
  if (paired) {
    for (let i = 0; i < count; i++)
      normals.push(first + step * 0.5 + (i * tau) / count)
  } else {
    for (let i = 0; i < p.strands; i++) normals.push(first + i * step)
    const remaining = tau - (p.strands - 1) * step
    const spans = Math.ceil(
      remaining / Math.min(Math.PI / 2, Math.max(step, Math.PI / 3)) - 1e-9
    )
    for (let i = 1; i < spans; i++)
      normals.push(normals.at(p.strands - 1) + (i * remaining) / spans)
  }
  // Add idle faces for very sparse designs so every neighbouring pair intersects.
  for (let i = normals.length - 1; i >= 0; i--) {
    const next = i === normals.length - 1 ? normals[0] + tau : normals[i + 1]
    if (next - normals[i] > Math.PI - 1e-6)
      normals.splice(i + 1, 0, (normals[i] + next) / 2)
  }
  const n = normals.length,
    pairs = paired && n === count
  const corners = normals.map((a, i) => {
    const gap = mod(a - normals[(i + n - 1) % n], tau)
    return { a: a - gap / 2, scale: 1 / Math.cos(gap / 2) }
  })
  const apothem = radius / Math.max(...corners.map((c) => c.scale))
  const wrapR = apothem / (pairs ? Math.cos(step / 2) : 1)
  const vertices = corners.map((c) => polar(apothem * c.scale, c.a))
  const stops = vertices.map((v, i) => {
    const a = sub(vertices[(i + 1) % n], v),
      b = sub(vertices[(i + n - 1) % n], v)
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (length(a) * length(b)))
      )
    )
    return Math.max(
      sockets.railStop,
      Math.ceil((f.od + f.clearance) / 2 / Math.tan(angle / 2) + 1)
    )
  })
  /** @type {{ length: number, start: number, end: number, marks: number[], split?: number }[]} */
  const edges = vertices.map((v, i) => ({
    length: length(sub(vertices[(i + 1) % n], v)),
    start: stops[i],
    end: stops[(i + 1) % n],
    marks: [],
  }))
  if (edges.some((e) => e.length <= e.start + e.end + 40))
    throw Error(
      'Two elbow sockets would meet on a rail. Increase the base diameter or use fewer runs.'
    )
  const runs = Array.from({ length: p.strands }, (_, i) => {
    const a = strandAngle(p, i),
      anchor = polar(wrapR, a),
      side = pairs
        ? Math.floor(i / 2)
        : normals.findIndex((normal) => Math.abs(normal - a) < 1e-7)
    const along = length(sub(anchor, vertices[side])),
      edge = edges[side]
    if (
      Math.min(along - edge.start, edge.length - along - edge.end) <
      20 + f.cord * 2 + 1
    )
      throw Error(
        'The elbows cover a wrap mark. Increase the base diameter or reduce the run count.'
      )
    edge.marks.push(along)
    return { side, along, anchor }
  })
  const braceIndices = [0]
  for (const target of [tau / 3, (2 * tau) / 3]) {
    const delta = (i) =>
      Math.abs(
        mod(corners[i].a - corners[0].a - target + Math.PI, tau) - Math.PI
      )
    const idx = corners.reduce(
      (best, _, i) => (delta(i) < delta(best) ? i : best),
      0
    )
    braceIndices.push(idx)
  }
  if (new Set(braceIndices).size !== 3)
    throw Error('The base needs three distinct braced vertices.')
  braceIndices.sort((a, b) => a - b)
  // On an even regular rim, the two opposite rails enter their receiving
  // elbows in the same direction as one rigid half slides onto the other.
  const regular = normals.every(
    (a, i) => Math.abs(a - normals[0] - (i * tau) / n) < 1e-7
  )
  const spokeEngagement = sockets.spokeMouth - sockets.spokeStop
  const parkingTravel = spokeEngagement + sockets.parkingClearance
  const roomForParking = braceIndices.every(
    (i) => length(vertices[i]) > 2 * sockets.spokeMouth + parkingTravel + f.od
  )
  const bridgeEdges = regular && n % 2 === 0 && roomForParking ? [0, n / 2] : []
  const spokeStart =
    sockets.spokeStop + (bridgeEdges.length ? parkingTravel : 0)
  const hubMouth = spokeStart + spokeEngagement
  if (!bridgeEdges.length) {
    // A split in each braced sector breaks each rigid loop. Fully park the sleeve
    // on one cut end, bring the free ends together, then slide it over the butt.
    for (let j = 0; j < 3; j++) {
      let best
      const end = braceIndices[j + 1] ?? n
      const middle = (braceIndices[j] + end) / 2
      for (let i = braceIndices[j]; i < end; i++) {
        const edge = edges[i]
        for (let k = 1; k < 100; k++) {
          const split = (edge.length * k) / 100,
            interval =
              Math.min(split - edge.start, edge.length - split - edge.end) - 20
          const room = Math.min(
            interval - sockets.sleeve / 2 - 1,
            Math.max(split - edge.start, edge.length - split - edge.end) -
              20 -
              sockets.sleeve -
              1,
            ...edge.marks.map(
              (mark) =>
                Math.abs(split - mark) - sockets.sleeve / 2 - 2 * f.cord - 1
            )
          )
          // Prefer an equal saw cut near the middle of this sector, away from its spoke.
          const bias = Math.abs(k - 50) + Math.abs(i + 0.5 - middle) / n
          if (
            room >= 0 &&
            (!best ||
              bias < best.bias ||
              (bias === best.bias && room > best.room + 1e-6))
          )
            best = { i, split, room, bias }
        }
      }
      if (!best)
        throw Error(
          'There is too little exposed rail to park a closure sleeve between wraps. Increase the base diameter or reduce the run count.'
        )
      edges[best.i].split = best.split
    }
  }
  const hubAngles = braceIndices.map((i) => (corners[i].a * 180) / Math.PI)
  const designs = new Map()
  const joints = vertices.map((v, i) => {
    const inward = bearing(v) + Math.PI
    const armAngle = (j) =>
      mod(bearing(sub(vertices[j], v)) - inward + Math.PI, tau) - Math.PI
    const railAngles = [armAngle((i + 1) % n), armAngle((i + n - 1) % n)]
      .map((a) => (a * 180) / Math.PI)
      .sort((a, b) => a - b)
    const brace = braceIndices.includes(i)
    const id = [brace, ...railAngles.map((a) => a.toFixed(5))].join('/')
    if (!designs.has(id)) {
      const prefix = brace ? 'spoke-corner' : 'plain-corner',
        copies = [...designs.values()].filter((d) => d.name.startsWith(prefix))
          .length
      designs.set(id, {
        name: prefix + (copies ? '-' + (copies + 1) : ''),
        railAngles,
        stop: stops[i],
        brace,
        quantity: 0,
      })
    }
    const design = designs.get(id)
    design.quantity++
    return { name: design.name, inward, brace }
  })
  return {
    vertices,
    edges,
    runs,
    wrapR,
    joints,
    hubAngles,
    bridgeEdges,
    spokeStart,
    hubMouth,
    braceIndices,
    designs: [...designs.values()],
  }
}
