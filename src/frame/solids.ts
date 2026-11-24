import { sockets } from './base.js'
import { polar } from './layout.js'

import type { Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d'
import type { defaults } from '../model.js'
import type { frameLayout, hardware } from './layout.js'

type Socket = { angle: number; stop: number; depth: number }
type Part = { name: string; quantity: number; solid: Manifold }

// Choose a multiple of four so cardinal points are exact. The chord error is
// bounded in millimetres, including on crowns much larger than an EMT socket.
function segments(radius: number) {
  return Math.max(
    32,
    4 * Math.ceil(Math.PI / (4 * Math.acos(1 - 0.012 / radius)))
  )
}
function arc(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number
): Vec2[] {
  const count = Math.max(
    5,
    Math.ceil((segments(radius) * Math.abs(end - start)) / 360)
  )
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = ((start + ((end - start) * i) / count) * Math.PI) / 180
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]
  })
}
export function panelScrews(start: number, span: number, radius: number) {
  return [0.3, 0.7].map((t) => polar(radius, start + t * span))
}

export function frameParts(
  { Manifold: M, CrossSection: C }: ManifoldToplevel,
  p: typeof defaults,
  f: typeof hardware,
  l: ReturnType<typeof frameLayout>
) {
  const tube = (f.od + f.clearance) / 2
  const cyl = (x: number, y: number, z: number, r: number, h: number) =>
    M.cylinder(h, r, r, segments(r)).translate([x, y, z])
  const turned = (profile: Vec2[], radius: number) =>
    C.ofPolygons([profile]).revolve(segments(radius))
  const roundedBarrel = (r: number, h: number, fillet: number) =>
    turned(
      [
        [0, 0],
        ...arc(r - fillet, fillet, fillet, -90, 0),
        ...arc(r - fillet, h - fillet, fillet, 0, 90),
        [0, h],
      ],
      r
    )
  const rx = (x: number, y: number, z: number, r: number, h: number) =>
    cyl(0, 0, 0, r, h).rotate([0, 90, 0]).translate([x, y, z])
  const ry = (x: number, y: number, z: number, r: number, h: number) =>
    cyl(0, 0, 0, r, h).rotate([-90, 0, 0]).translate([x, y, z])
  const union = (...s: Manifold[]) => M.union(s)
  const cut = (s: Manifold, ...holes: Manifold[]) =>
    holes.length ? s.subtract(union(...holes)) : s
  const sector = (a: number, span: number, r: number, h: number) =>
    C.ofPolygons([
      [
        [0, 0],
        ...arc(0, 0, r, (a * 180) / Math.PI, ((a + span) * 180) / Math.PI),
      ],
    ]).extrude(h)
  const result: Part[] = []
  const add = (name: string, quantity: number, solid: Manifold) =>
    result.push({ name, quantity, solid })

  // Every branch has a cylindrical female bore and an integral end stop.
  // The flat central foot holds the EMT above ground for the cord underneath.
  function fitting(name: string, count: number, ports: Socket[], mast = false) {
    const outer = tube + 5.5,
      skins = [
        roundedBarrel(outer, 2 * sockets.axisHeight - 3, 1.5).translate([
          0,
          0,
          -sockets.axisHeight,
        ]),
      ]
    // A 10 mm web with tangent R8 inside corners ties adjacent branches
    // together. Its ends are buried in the barrels, well behind their mouths.
    const roots = [C.circle(outer - 1, segments(outer - 1))]
    const bores: Manifold[] = []
    for (const { angle, stop, depth } of ports) {
      const end = stop + depth
      skins.push(
        roundedBarrel(outer, end, 1.5).rotate([0, 90, 0]).rotate([0, 0, angle])
      )
      roots.push(
        C.square([Math.min(end - 6, 38), 2 * (outer - 1)])
          .translate([0, 1 - outer])
          .rotate(angle)
      )
      if (mast) {
        // The concave quarter-circle adds a buttress between mast and spoke.
        const rib = C.ofPolygons([
          [
            [20, outer - 3],
            [40, outer - 3],
            [40, outer],
            ...arc(37, outer + 14, 14, -90, -180),
            [20, outer + 14],
          ],
        ])
          .extrude(10)
          .rotate([90, 0, 0])
          .translate([0, 5, 0])
        skins.push(rib.rotate([0, 0, angle]))
      }
      bores.push(rx(stop, 0, 0, tube, depth + 2).rotate([0, 0, angle]))
      bores.push(
        cyl(end - Math.min(10, depth * 0.4), 0, 0, 1.65, outer + 2).rotate([
          0,
          0,
          angle,
        ])
      )
    }
    const web = C.union(roots)
      .offset(8, 'Round', 2, segments(8))
      .offset(-8, 'Round', 2, segments(8))
    skins.push(web.extrude(10).translate([0, 0, -5]))
    if (mast) {
      skins.push(roundedBarrel(23, 67, 1.5))
      bores.push(cyl(0, 0, 20, tube, 50), rx(0, 0, 50, 1.65, 25))
    }
    add(name, count, cut(union(...skins), ...bores))
  }
  const spoke = (angle: number) => ({
    angle,
    stop: sockets.spokeStop,
    depth: sockets.spokeMouth - sockets.spokeStop,
  })
  fitting(
    'mast-base',
    1,
    l.base.hubAngles.map((angle) => ({
      ...spoke(angle),
      depth: l.base.hubMouth - sockets.spokeStop,
    })),
    true
  )
  for (const d of l.base.designs) {
    const ports = d.railAngles.map((angle: number) => ({
      angle,
      stop: d.stop,
      depth: 20,
    }))
    if (d.brace) ports.push(spoke(0))
    fitting(d.name, d.quantity, ports)
  }
  const half = sockets.sleeve / 2
  const unionCount = l.base.edges.filter((edge) => edge.split).length
  if (unionCount)
    add(
      'sliding-union',
      unionCount,
      cut(
        roundedBarrel(tube + 6, sockets.sleeve, 1.5).translate([0, 0, -half]),
        cyl(0, 0, -half - 1, tube, sockets.sleeve + 2),
        rx(0, 0, -10, 1.65, 26),
        rx(0, 0, 10, 1.65, 26)
      )
    )
  const topR = l.topR
  const slots = l.crown.map(([x, y]) => {
    const half = (l.slotLength - l.slotWidth) / 2,
      r = l.slotWidth / 2
    // Sweep the rounded cutter ends along the straight part of the slot.
    const lip = 0.9
    const wall: Vec2[] = [
      [r + lip, -1],
      ...arc(r + lip, lip, lip, -90, -180),
      ...arc(r + lip, 6 - lip, lip, 180, 90),
      [r + lip, 7],
    ]
    const end = turned([[0, -1], ...wall, [0, 7]], r + lip)
    const middle = C.ofPolygons([
      [
        ...wall,
        ...wall
          .slice()
          .reverse()
          .map(([x, z]): Vec2 => [-x, z]),
      ],
    ])
      .extrude(2 * half)
      .rotate([90, 0, 0])
      .translate([0, half, 0])
    return union(
      middle,
      end.translate([0, -half, 0]),
      end.translate([0, half, 0])
    )
      .rotate([0, 0, (Math.atan2(y, x) * 180) / Math.PI])
      .translate([x, y, 0])
  })
  let sleeve = cut(
    roundedBarrel(23, 40, 1.2),
    cyl(0, 0, -2, tube, 45),
    rx(-25, 0, 26, 1.65, 50)
  )
  const profile = C.ofPolygons([
    [
      [21, 0],
      ...arc(topR - 1.5, 1.5, 1.5, -90, 0),
      ...arc(topR - 1.5, 4.5, 1.5, 0, 90),
      [21, 6],
    ],
  ])
  const collarFillet = (r: number, fillet: number, z: number) =>
    turned(
      [
        [21, z],
        ...arc(r + fillet, z + fillet, fillet, -90, -180),
        [21, z + fillet],
      ],
      r + fillet
    )
  if (l.crownSections === 1) {
    const rootRadius = Math.min(6, l.slotRadius - l.slotWidth / 2 - 24)
    add(
      'mast-crown',
      1,
      cut(
        union(
          sleeve,
          collarFillet(23, rootRadius, 6),
          profile.revolve(segments(topR))
        ),
        ...slots
      )
    )
  } else {
    const flange = cut(
      roundedBarrel(49, 8, 1.2).translate([0, 0, -8]),
      cyl(0, 0, -9, tube, 11)
    )
    sleeve = union(sleeve, flange, collarFillet(23, 4, 0))
    // A matching relief on each panel seats its flat face on the flange.
    const collarRelief = turned(
      [
        [0, -1],
        [27.6, -1],
        ...arc(27.6, 4.3, 4.3, -90, -180),
        [23.3, 8],
        [0, 8],
      ],
      27.6
    )
    for (let i = 0; i < l.crownSections; i++) {
      const arc = (2 * Math.PI) / l.crownSections,
        a = l.crownPhase + i * arc
      const loc = panelScrews(a, arc, 36)
      const ring = profile
        .revolve(segments(topR), (arc * 180) / Math.PI)
        .rotate([0, 0, (a * 180) / Math.PI])
      // Panel inside edge clears the separate collar.
      const panel = cut(
        ring,
        ...slots,
        collarRelief,
        ...loc.map(([x, y]) => cyl(x, y, -1, 2.25, 9))
      )
      add('crown-panel-' + (i + 1), 1, panel)
      sleeve = cut(sleeve, ...loc.map(([x, y]) => cyl(x, y, -9, 1.65, 11)))
    }
    add('mast-collar', 1, sleeve)
  }

  if (l.star) {
    const { vertices, lights, rim, phase, sections } = l.star
    // Each edge is the hull of two rounded pads. The flat 4 mm interior
    // preserves the pixel grip while the external rim rolls over on both faces.
    const outline = vertices.map(([x, y]): Vec2 => [x, y])
    const pad = roundedBarrel(rim, 4, 0.9)
    const tips = outline.map(([x, y]) => pad.translate([x, y, 0]))
    const blank = union(
      C.ofPolygons([outline]).extrude(4),
      ...tips.map((tip, i) => M.hull([tip, tips[(i + 1) % tips.length]]))
    )
    const plate = cut(
      blank,
      ...lights.map(([x, y]) => cyl(x, y, -1, p.holeDiameter / 2, 7))
    )
    let back = cut(
      union(
        roundedBarrel(l.star.screwRadius + 9, 10, 1.5).translate([0, 0, -10]),
        // Flare the backing into the socket with a broad, rounded saddle.
        M.hull([
          roundedBarrel(18, 8, 2).translate([0, -10, -16]),
          roundedBarrel(16, 38, 2).rotate([-90, 0, 0]).translate([0, -38, -30]),
        ]),
        roundedBarrel(23, 48, 1.5).rotate([-90, 0, 0]).translate([0, -44, -30])
      ),
      ry(0, -46, -30, tube, 44),
      rx(0, -28, -30, 1.65, 26)
    )
    for (let i = 0; i < sections; i++) {
      const arc = (2 * Math.PI) / sections,
        a = phase + i * arc
      const loc = panelScrews(a, arc, l.star.screwRadius)
      const face =
        sections === 1
          ? plate
          : plate.intersect(
              sector(a, arc, p.starWidth * 32, 4).translate([
                -Math.sin(phase) * l.star.offset,
                Math.cos(phase) * l.star.offset,
                0,
              ])
            )
      add(
        sections === 1 ? 'star-face' : 'star-face-' + (i + 1),
        1,
        cut(face, ...loc.map(([x, y]) => cyl(x, y, -1, 2.25, 7)))
      )
      back = cut(back, ...loc.map(([x, y]) => cyl(x, y, -10, 1.65, 11)))
    }
    add('star-socket', 1, back.rotate([90, 0, 0]))
  }
  return result
}
