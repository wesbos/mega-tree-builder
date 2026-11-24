export const defaults = {
  height: 94.37,
  base: 62.91,
  top: 10,
  angle: 360,
  strands: 24,
  pitch: 2,
  pixelsPerString: 50,
  stringsPerRun: 1,
  star: true,
  starWidth: 12,
  starPixels: 40,
  volts: 12,
  watts: 900,
  milliamps: 50,
  stripWidth: 1.2,
  thickness: 0.06,
  holeDiameter: 12.5,
  holePitch: 1,
  rollFeet: 164,
  tail: 1,
}

export function calculate(p) {
  const length = Math.hypot(p.height, (p.base - p.top) / 2)
  const perStrand = Math.floor(length / p.pitch + 1e-10) + 1
  const treePixels = perStrand * p.strands
  const total = treePixels + (p.star ? p.starPixels : 0)
  const gaps = p.strands - (p.angle === 360 ? 0 : 1)
  const arc = (Math.PI * p.base * p.angle) / 360
  const amps = (total * p.milliamps) / 1000
  const draw = amps * p.volts
  const cut = length + 2 * p.tail
  // Repeat cuts at the same phase in the punched stock so each strand aligns.
  const repeatLength = Math.ceil(cut / p.holePitch - 1e-10) * p.holePitch
  const cutsPerRoll = Math.max(
    0,
    1 + Math.floor((p.rollFeet * 12 - cut) / repeatLength + 1e-10),
  )
  const rolls = cutsPerRoll ? Math.ceil(p.strands / cutsPerRoll) : Infinity
  const holeStep = p.pitch / p.holePitch
  return {
    cut,
    cutsPerRoll,
    rolls,
    stockLength: cut * p.strands,
    onPitch: Math.abs(holeStep - Math.round(holeStep)) < 1e-8,
    topGap: (Math.PI * p.top * p.angle) / 360 / gaps,
    length,
    perStrand,
    treePixels,
    total,
    arc,
    baseGap: arc / gaps,
    strip: length * p.strands,
    leftover: Math.max(0, length - (perStrand - 1) * p.pitch),
    amps,
    draw,
    load: (100 * draw) / p.watts,
    remaining: p.watts - draw,
    capacity: p.watts / p.volts,
  }
}

export function strandAngle(p, index) {
  const sweep = (p.angle * Math.PI) / 180
  return sweep * (index / (p.strands - (p.angle === 360 ? 0 : 1)) - 0.5)
}

// Size the frame to the distance from the first to the last occupied hole.
export function compareBuilds(p, budget, fullCircleStrands) {
  const available = budget - (p.star ? p.starPixels : 0)
  const perStrand = p.pixelsPerString * p.stringsPerRun
  const affordableRuns = Math.floor(available / perStrand)
  if (affordableRuns < 2) return []
  const taper = p.base / (2 * p.height)
  const topRadius = p.top / 2
  const builds = []
  for (const angle of [180, 270, 360]) {
    const targetRuns =
      angle === 360
        ? fullCircleStrands
        : Math.round((fullCircleStrands * angle) / 360) + 1
    const strands = Math.min(targetRuns, affordableRuns)
    for (const step of [1, 2, 3]) {
      const pitch = p.holePitch * step
      const length = (perStrand - 1) * pitch
      // h² + (taper × h − topRadius)² = length².
      const discriminant = (1 + taper ** 2) * length ** 2 - topRadius ** 2
      if (discriminant < 0) continue
      const height =
        (taper * topRadius + Math.sqrt(discriminant)) / (1 + taper ** 2)
      const base = 2 * taper * height
      if (
        height < 1 ||
        height > 2400 ||
        base < Math.max(1, p.top) ||
        base > 2400
      )
        continue
      // Round dimensions upward to hundredths of an inch to keep both endpoint pixels.
      const geometry = {
        angle,
        strands,
        pitch,
        height: Math.ceil(height * 100) / 100,
        base: Math.ceil(base * 100) / 100,
      }
      const result = calculate({ ...p, ...geometry })
      builds.push({ geometry, result })
    }
  }
  return builds
}
