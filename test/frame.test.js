import test from 'node:test'
import assert from 'node:assert/strict'
import init from 'manifold-3d'
import { unzipSync, strFromU8 } from 'fflate'
import { buildKit } from '../src/frame/kit.js'
import { defaults } from '../src/model.js'
import { hardware, frameLayout } from '../src/frame/layout.js'

import { previewLayout } from '../src/frame/assembled.js'
import { strandAngle } from '../src/model.js'
import { sockets } from '../src/frame/base.js'
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2e8AAAAASUVORK5CYII=',
    'base64'
  )
)
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' versus ' + b)
test('every occupied row shares one elevation, radius and angular step', () => {
  for (const patch of [
    {},
    { top: 6, base: 22.5, pitch: 1, height: 48 },
    { angle: 180, strands: 13 },
    { angle: 270, strands: 19 },
    { angle: 250, strands: 12 },
    { strands: 15 },
  ]) {
    const p = { ...defaults, ...patch },
      { l, runs } = previewLayout(p, hardware)
    for (let j = 0; j < l.m.perStrand; j++) {
      const d = (l.ends * p.holePitch + j * p.pitch) * 25.4
      const points = runs.map((r) => r.end.clone().addScaledVector(r.along, d))
      points.forEach((v, i) => {
        near(v.y, points[0].y)
        const radius = Math.hypot(points[0].x, points[0].z)
        near(v.x, radius * Math.sin(strandAngle(p, i)))
        near(v.z, radius * Math.cos(strandAngle(p, i)))
      })
    }
    for (const r of l.runs) {
      const e = l.base.edges[r.side],
        a = l.base.vertices[r.side],
        b = l.base.vertices[(r.side + 1) % l.base.vertices.length]
      for (let k = 0; k < 2; k++)
        near(a[k] + ((b[k] - a[k]) * r.along) / e.length, r.anchor[k])
      assert.ok(
        Math.min(r.along - e.start, e.length - r.along - e.end) >
          20 + 2 * hardware.cord
      )
    }
    assert.equal(
      l.base.edges.filter((e) => e.split).length,
      l.base.bridgeEdges.length ? 0 : 3
    )
    for (const e of l.base.edges.filter((e) => e.split)) {
      assert.ok(
        Math.max(e.split - e.start, e.length - e.split - e.end) - 20 >
          sockets.sleeve
      )
      assert.ok(
        e.marks.every(
          (mark) =>
            Math.abs(mark - e.split) > sockets.sleeve / 2 + 2 * hardware.cord
        )
      )
    }
    near(l.topR, p.top * 12.7)
    runs.forEach((r) => near(r.lip.distanceTo(r.rim), hardware.topReach))
  }
})
test('24 runs use paired anchors on 12 equal rails and one level of bungee slots', () => {
  const l = frameLayout(defaults)
  assert.equal(l.base.edges.length, 12)
  assert.ok(l.base.edges.every((e) => e.marks.length === 2))
  assert.equal(l.m.perStrand, 50)
  near(l.cut / 25.4, 101)
  near(l.mast + 20 - l.star.riser + 3, l.rise)
  near(frameLayout({ ...defaults, top: 6 }).topR, 6 * 12.7)
  assert.throws(() => frameLayout({ ...defaults, pitch: 1.5 }), /punched strip/)
})
test('both whole bridge rails close in one translation and all three spokes can park', () => {
  const b = frameLayout(defaults).base
  assert.deepEqual(b.bridgeEdges, [0, 6])
  assert.equal(b.edges.filter((e) => e.split).length, 0)
  assert.equal(
    b.designs.reduce((sum, part) => sum + part.quantity, 1),
    13
  )
  const approach = (start, end) => {
    const a = b.vertices[start],
      v = b.vertices[end],
      d = Math.hypot(v[0] - a[0], v[1] - a[1])
    return v.map((x, k) => (20 * (x - a[k])) / d)
  }
  const slide = approach(1, 0)
  approach(6, 7).forEach((val, i) => near(val, slide[i]))
  for (const i of b.braceIndices) {
    const radius = Math.hypot(...b.vertices[i])
    const cut = radius - sockets.spokeStop - b.spokeStart
    near(radius - sockets.spokeMouth - (sockets.spokeStop + cut), 2)
    near(b.hubMouth - b.spokeStart, 25)
    near(b.spokeStart + cut - (radius - sockets.spokeMouth), 25)
  }
  const odd = frameLayout({ ...defaults, strands: 15 }).base
  assert.deepEqual(odd.bridgeEdges, [])
  assert.equal(odd.edges.filter((e) => e.split).length, 3)
})
test('every binary STL in the default ZIP has a closed, oriented surface', async () => {
  const kernel = await init()
  kernel.setup()
  const files = unzipSync(buildKit(kernel, defaults, hardware, png, png))
  assert.match(
    strFromU8(files['ASSEMBLY.txt']),
    /24 strips × 50 tree pixels \+ 40 star pixels/
  )
  assert.deepEqual(files['tree-render.png'], png)
  assert.ok(files['joint-sections.svg'])
  const stls = Object.entries(files).filter(([name]) => name.endsWith('.stl'))
  assert.deepEqual(
    stls.map(([name]) => name),
    [
      'mast-base',
      'spoke-corner',
      'plain-corner',
      'mast-crown',
      'star-face-1',
      'star-face-2',
      'star-socket',
    ].map((name) => 'STL/' + name + '.stl')
  )
  for (const [name, file] of stls) {
    const d = new DataView(file.buffer, file.byteOffset, file.byteLength),
      n = d.getUint32(80, true)
    const edges = new Map()
    assert.equal(file.length, 84 + 50 * n)
    for (let i = 0; i < n; i++) {
      const a = 84 + 50 * i + 12
      const pts = [0, 1, 2].map((k) =>
        [0, 1, 2].map((c) => d.getFloat32(a + 12 * k + 4 * c, true)).join(',')
      )
      assert.equal(
        new Set(pts).size,
        3,
        name + ' contains a collapsed triangle'
      )
      for (let k = 0; k < 3; k++) {
        const u = pts[k],
          v = pts[(k + 1) % 3],
          id = u < v ? u + '|' + v : v + '|' + u
        const e = edges.get(id) ?? [0, 0]
        e[0]++
        e[1] += u < v ? 1 : -1
        edges.set(id, e)
      }
    }
    assert.ok(
      [...edges.values()].every(
        ([count, winding]) => count === 2 && winding === 0
      ),
      name
    )
  }
})

test('female elbows accept an axial EMT gauge and enclose it at the socket mouth', async () => {
  const kernel = await init()
  kernel.setup()
  const { frameParts } = await import('../src/frame/solids.ts')
  const l = frameLayout(defaults),
    parts = frameParts(kernel, defaults, hardware, l)
  const { Manifold: M } = kernel
  const gauge = M.cylinder(19.8, hardware.od / 2, hardware.od / 2, 64).rotate([
    0,
    90,
    0,
  ])
  const hub = parts.find((p) => p.name === 'mast-base').solid
  // The entire bearing patch lies on the ground datum. A single contour and
  // a patch under every socket catch both a central nub and separate feet.
  const contact = (solid, ports, minimumArea) => {
    near(solid.boundingBox().min[2], -sockets.axisHeight)
    const footprint = solid.slice(-sockets.axisHeight + 0.001)
    assert.equal(footprint.numContour(), 1)
    assert.ok(footprint.area() > minimumArea)
    for (const [angle, mouth] of ports) {
      const a = (angle * Math.PI) / 180,
        reach = mouth - 14
      const patch = kernel.CrossSection.circle(4, 32).translate([
        reach * Math.cos(a),
        reach * Math.sin(a),
      ])
      near(patch.subtract(footprint).area(), 0)
    }
  }
  contact(
    hub,
    l.base.hubAngles.map((a) => [a, l.base.hubMouth]),
    6000
  )
  for (const d of l.base.designs.filter((d) => d.brace)) {
    const ports = [
      ...d.railAngles.map((a) => [a, d.stop + 20]),
      [0, sockets.spokeMouth],
    ]
    contact(parts.find((p) => p.name === d.name).solid, ports, 1700)
  }
  const fullTravelGauge = M.cylinder(
    l.base.hubMouth - sockets.spokeStop,
    hardware.od / 2,
    hardware.od / 2,
    64
  )
    .rotate([0, 90, 0])
    .translate([sockets.spokeStop + 0.05, 0, 0])
  for (const angle of l.base.hubAngles)
    near(hub.intersect(fullTravelGauge.rotate([0, 0, angle])).volume(), 0)
  for (const d of l.base.designs) {
    const body = parts.find((p) => p.name === d.name).solid
    for (const a of d.railAngles) {
      const R = (g) => g.rotate([0, 0, a])
      near(body.intersect(R(gauge.translate([d.stop + 0.1, 0, 0]))).volume(), 0)
      // Probe a full annulus just inside the open end, away from the set screw.
      const ring = M.cylinder(1, hardware.od / 2 + 3, hardware.od / 2 + 3, 64)
        .subtract(M.cylinder(1, hardware.od / 2 + 1, hardware.od / 2 + 1, 64))
        .rotate([0, 90, 0])
        .translate([d.stop + 18, 0, 0])
      near(R(ring).subtract(body).volume(), 0)
    }
  }
})

test('six-inch crown keeps every slot open for the doubled cord with a continuous outer bridge', async () => {
  const kernel = await init()
  kernel.setup()
  const { frameParts } = await import('../src/frame/solids.ts')
  const p = { ...defaults, top: 6 },
    l = frameLayout(p),
    crown = frameParts(kernel, p, hardware, l).find(
      (s) => s.name === 'mast-crown'
    ).solid
  const M = kernel.Manifold
  near(l.slotWidth, 5)
  near(l.slotLength, 8.8)
  for (const [x, y] of l.crown) {
    const a = (Math.atan2(y, x) * 180) / Math.PI
    for (const side of [-1, 1]) {
      const cord = M.cylinder(8, 1.6, 1.6, 32)
        .translate([l.slotRadius, side * 1.65, -1])
        .rotate([0, 0, a])
      near(crown.intersect(cord).volume(), 0)
    }
    const bridge = M.cylinder(1, 1, 1, 16)
      .translate([l.topR - 3, 0, 2])
      .rotate([0, 0, a])
    near(bridge.subtract(crown).volume(), 0)
  }
})

test('the cut sheet groups fractional tape marks and accounts for kerf and longer masts', async () => {
  const { cutSheet } = await import('../src/frame/cut-sheet.js')
  const l = frameLayout(defaults)
  const standard = cutSheet(l)
  assert.match(standard.buy, /4 × 10-foot sticks/)
  assert.match(standard.text, /12 +Rail +15 21\/32"/)
  assert.match(standard.text, /3 +Spoke +28 1\/32"/)
  const mastOnly = { base: { braceIndices: [], edges: [] }, mast: 3048 }
  assert.match(cutSheet(mastOnly).text, /Stick 1 +1 × 120" mast +\| +0" left/)
  const longer = cutSheet({ ...l, mast: 130 * 25.4 })
  assert.equal(longer.longer.length, 1)
  assert.match(longer.longer[0], /130"/)
  assert.doesNotMatch(longer.text, /Stick \d +1 × 130"/)
})

test('rolling-ball mast blend follows the socket saddle and segmented crown seats without interference', async () => {
  const k = await init()
  k.setup()
  const p = { ...defaults, top: 12, strands: 15 }
  const l = frameLayout(p)
  const { frameParts } = await import('../src/frame/solids.ts')
  const parts = frameParts(k, p, hardware, l)
  const hub = parts.find((p) => p.name === 'mast-base').solid
  const probe = k.Manifold.cube([1, 1, 1])
    .translate([25, -0.5, 22])
    .rotate([0, 0, l.base.hubAngles[0]])
  near(probe.intersect(hub).volume(), 1)
  // A rolling ball touches the upright and horizontal barrel. Sample the
  // middle of its arc at five positions around the upper socket saddle.
  const R = 12,
    mastRadius = 23,
    socketRadius = (hardware.od + hardware.clearance) / 2 + 5.5
  for (const y of [-19, -10, 0, 10, 19]) {
    const x = Math.sqrt((mastRadius + R) ** 2 - y * y),
      z = Math.sqrt((socketRadius + R) ** 2 - y * y)
    const direction = [
      x / (mastRadius + R),
      y / (mastRadius + R) + y / (socketRadius + R),
      z / (socketRadius + R),
    ]
    const norm = Math.hypot(...direction)
    for (const [distance, inside] of [
      [R + 0.25, true],
      [R - 0.25, false],
    ]) {
      const point = [x, y, z].map(
        (v, i) => v - (direction[i] / norm) * distance
      )
      const bead = k.Manifold.sphere(0.05, 12)
        .translate(point)
        .rotate([0, 0, l.base.hubAngles[0]])
      near(bead.intersect(hub).volume(), inside ? bead.volume() : 0)
    }
  }
  const collar = parts.find((p) => p.name === 'mast-collar').solid
  for (const panel of parts.filter((p) => p.name.startsWith('crown-panel'))) {
    near(panel.solid.intersect(collar).volume(), 0)
  }
  const files = unzipSync(buildKit(k, p, hardware, png, png))
  assert.ok(files['STL/sliding-union.stl'])
  assert.ok(files['CUT-SHEET.txt'])
  assert.match(strFromU8(files['START-HERE.txt']), /10-foot sticks/)
})
