import { zipSync, strToU8 } from 'fflate'
import { hardware, frameLayout } from './layout.js'
import { cutSheet } from './cut-sheet.js'
import { sockets } from './base.js'
import { frameParts } from './solids.ts'

const mm = (n) => n.toFixed(1)
const inch = (n) => (n / 25.4).toFixed(2)
function stl(model) {
  const { vertProperties: v, triVerts: t, numProp: stride } = model.getMesh()
  const data = new Uint8Array(84 + (50 * t.length) / 3),
    out = new DataView(data.buffer)
  out.setUint32(80, t.length / 3, true)
  let pos = 84
  for (let k = 0; k < t.length; k += 3) {
    const pts = [0, 1, 2].map((i) =>
      Array.from(v.slice(t[k + i] * stride, t[k + i] * stride + 3))
    )
    const [a, b, c] = pts,
      u = b.map((x, i) => x - a[i]),
      w = c.map((x, i) => x - a[i])
    const n = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ]
    const norm = Math.hypot(...n)
    for (const value of [
      ...n.map((x) => (norm ? x / norm : 0)),
      ...pts.flat(),
    ]) {
      out.setFloat32(pos, value, true)
      pos += 4
    }
    pos += 2
  }
  return data
}
function diagram(l) {
  const b = l.base,
    vertices = b.vertices.map((v) => v.map((c) => (140 * c) / l.baseR))
  const xy = ([x, y]) => [200 + x, 170 - y].join(',')
  const spokes = b.braceIndices
    .map(
      (i) =>
        '<line x1="200" y1="170" x2="' +
        (200 + vertices[i][0]) +
        '" y2="' +
        (170 - vertices[i][1]) +
        '"/>'
    )
    .join('')
  const dots = l.runs
    .map(
      (r) =>
        '<circle cx="' +
        (200 + (140 * r.anchor[0]) / l.baseR) +
        '" cy="' +
        (170 - (140 * r.anchor[1]) / l.baseR) +
        '" r="3.5"/>'
    )
    .join('')
  const closureMarks = b.edges
    .map((e, i) => {
      if (!e.split && !b.bridgeEdges.includes(i)) return ''
      const a = vertices[i],
        v = vertices[(i + 1) % vertices.length],
        t = e.split ? e.split / e.length : i === 0 ? 0 : 1
      return (
        '<rect x="' +
        (196 + a[0] * (1 - t) + v[0] * t) +
        '" y="' +
        (166 - a[1] * (1 - t) - v[1] * t) +
        '" width="8" height="8" fill="#126eaa"/>'
      )
    })
    .join('')
  const labels = vertices
    .map(
      (v, i) =>
        '<text x="' +
        (200 + v[0] * 1.14) +
        '" y="' +
        (175 - v[1] * 1.14) +
        '" text-anchor="middle">V' +
        (i + 1) +
        '</text>'
    )
    .join('')
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 345"><rect width="400" height="345" fill="#f5f5ef"/><g fill="none" stroke="#354543" stroke-width="5"><polygon points="' +
    vertices.map(xy).join(' ') +
    '"/>' +
    spokes +
    '</g><g fill="#ce4a1c">' +
    dots +
    closureMarks +
    '</g><g font-family="sans-serif" font-size="16" fill="#223a33">' +
    labels +
    '<text x="200" y="332" text-anchor="middle">Dots = wraps · squares = ' +
    (b.bridgeEdges.length ? 'receiving elbows' : 'unions') +
    '</text></g></svg>'
  )
}
function sheet(p, f, l, parts) {
  const base = l.base,
    n = base.edges.length
  return `MEGA TREE BUILDER  /  FEMALE-SOCKET FRAME
Dimensions are in mm. Use base-plan.svg viewed from above.

LIGHT LAYOUT
${p.strands} strips × ${l.m.perStrand} tree pixels${
    p.star ? ' + ' + p.starPixels + ' star pixels' : ''
  }. Wrap ${p.angle}°. Neighbouring strips are ${(
    p.angle /
    (p.strands - (p.angle === 360 ? 0 : 1))
  ).toFixed(3)}° apart.
Crown outside diameter ${inch(
    l.topR * 2
  )} in. All slots lie in one plane. Set the upper rim ${mm(
    sockets.axisHeight + l.rise
  )} mm above level ground. Each closed slot is ${mm(l.slotLength)} × ${mm(
    l.slotWidth
  )} mm for Ø${mm(
    f.cord
  )} doubled cord. The bridge to the outer rim is 6 mm across at mid-thickness.
The ${n}-sided base has a maximum vertex radius of ${mm(
    l.baseR
  )} mm. Every wrap mark lies on exposed tube at radius ${mm(
    base.wrapR
  )} mm. Identical strip lengths, attachment radii and loaded reaches align the rows. Flexible edges may overlap near the crown.
Use ${
    2 * p.strands
  } ball bungees, one at each end of each strip. Trial upper reach from the rim to the top empty hole is ${mm(
    f.topReach
  )} mm; lower reach from the bottom empty hole to the rail axis is ${mm(
    f.reach
  )} mm. Check both using your ${f.loop} mm relaxed loops and Ø${
    f.ball
  } mm balls. Use the measured loaded reaches before cutting the mast.

PRINTS
${parts.map((v) => v.quantity + ' × ' + v.name).join('\n')}
Print in mm at 100%. Test one elbow on a deburred tube offcut. Each rim socket encloses the tube through 360° for 20 mm of axial engagement. Nominal socket bore Ø${mm(
    f.od + f.clearance
  )} for Ø${mm(
    f.od
  )} EMT. Inspect horizontal bores for sag or support residue. Smooth any stringing from the slot and rounded rim. Lace one strip at both ends and check it holds before printing a batch.
For ABS or PETG, test the socket on an offcut printed with your production material, orientation and slicer profile. The base fittings export foot down and the star socket exports with its flat mounting face on the bed. Inspect the upper inside surface of each horizontal socket and remove support material before fitting EMT.
The printed fittings are prototypes. Wind resistance, creep and anchoring for your site need physical verification.

ASSEMBLY
1. Lay out numbered fittings using the map. Spoke corners are ${base.braceIndices
    .map((i) => 'V' + (i + 1))
    .join(', ')}. Corner file at each vertex:
${base.joints.map((j, i) => 'V' + (i + 1) + ' = ' + j.name).join(' · ')}
${
  base.bridgeEdges.length
    ? `2. On level ground build one open arc from V2 through V${
        n / 2 + 1
      } and a second from V${
        n / 2 + 2
      } through V${n} to V1. Fully seat the two remaining whole rails in the outward-facing sockets at V2 and V${
        n / 2 + 1
      }. Snug those two set screws. Align the free ends with the marked elbows at V1 and V${
        n / 2 + 2
      }. Slide the halves straight together until both ends seat (20 mm insertion), then snug the two receiving screws.
3. On the ground beside the rim, slide all three spokes fully into the centre hub. Lower the hub and parked spokes together into the centre of the closed rim. Align each spoke with its corner socket. Slide each tube outward ${mm(
        base.spokeStart - sockets.spokeStop
      )} mm to its outer stop. Each end now has 25 mm of engagement. Snug both set screws on each spoke before fitting the mast.`
    : `2. Assemble three independent perimeter arcs on the ground. Each arc contains one spoke corner. Push every square-cut pipe AXIALLY into its female elbow to its stop. Each arc ends at two half rails. Park a sliding union fully on one bare half at each of the three breaks (use the longer exposed side).
3. Seat the three spokes in the centre hub. Bring each finished arc inward from outside and slide its spoke corner onto its spoke. At each break align the ends with a 1 mm gap, then centre the 40 mm sleeve over them (19.5 mm overlap per end). Tighten both sleeve screws. The closed elbows stay intact throughout assembly.`
}
4. Seat the mast. ${
    l.crownSections === 1
      ? 'Slide the printed crown onto it.'
      : 'Screw the crown sections to the collar and slide the assembly onto the mast.'
  } Set the crown rim to the height above. Rotate the crown until the first slot and its wrap mark lie on the same radial line through the mast. Tighten both collar screws.
5. Cut ${p.strands} identical strips at ${mm(l.cut)} mm (${inch(
    l.cut
  )} in), halfway between holes. At the top, push the doubled loop through the upper empty strip hole so the ball rests on the outward face. Thread the loop up through its crown slot, take it over the outer rim, then stretch it back over the ball. Lap adjoining strip edges in the same clockwise direction wherever they meet. Set the first pixel of every strip to the same measured height. Start pixels ${
    l.ends
  } stock interval(s) below that hole and use every ${Math.round(
    p.pitch / p.holePitch
  )} hole(s). Reserve the bottom empty hole for the bungee. Thread the doubled cord through that hole, around bare EMT at its mark, then back over its ball. Tension opposing runs evenly and check the wraps stay at their marks.
${
  l.star
    ? '6. Screw the star face to its backing, insert pixels, and seat the star socket on the mast. Snug its side screw.'
    : ''
}

SCREWS
Use #8 × 3/8 in coarse-thread pan-head screws as set screws in the 3.3 mm printed pilots. Seat the tip against the EMT. Use ${
    base.bridgeEdges.length
      ? 'four for the parallel rim rails (both ends of each), six for the spokes (both ends of each)'
      : 'six for the unions'
  }, two for the crown, one for the mast base${
    l.star ? ', and one for the star socket' : ''
  }. The remaining horizontal sockets have optional retention pilots. Use ${
    (l.star ? l.star.sections * 2 : 0) +
    (l.crownSections > 1 ? l.crownSections * 2 : 0)
  } #8 × 1/2 in screws for the panel faces where fitted.

BARE-PIPE WRAP MARKS
Measure along the rail axis from the centre of the first vertex, before deducting its socket stop.
${l.runs
  .map(
    (r, i) =>
      'Strip ' +
      (i + 1) +
      '   V' +
      (r.side + 1) +
      ' → V' +
      (((r.side + 1) % n) + 1) +
      '   ' +
      mm(r.along) +
      ' mm'
  )
  .join('\n')}
`
}
// Section the finished solid, including bores and pilots. Each panel uses the
// same millimetre scale so the amount of material at a junction is visible.
function jointSections(parts, layout) {
  const views = [
    [
      'Mast hub · spoke centreline',
      'mast-base',
      layout.base.hubAngles[0],
      true,
    ],
    ['Spoke elbow · horizontal', 'spoke-corner', 0, false],
    ['Rim elbow · horizontal', 'plain-corner', 0, false],
    ['Star socket · vertical', 'star-socket', 90, true],
  ]
  let y = 15
  const rows = []
  for (const [label, name, angle, vertical] of views) {
    const part = parts.find((p) => p.name === name)
    if (!part) continue
    const solid = vertical
      ? part.solid.rotate([0, 0, -angle]).rotate([90, 0, 0])
      : part.solid
    const section = solid.slice(0)
    const { min, max } = section.bounds()
    const contours = section
      .toPolygons()
      .map(
        (poly) =>
          'M' +
          poly.map(([x, v]) => x.toFixed(2) + ',' + (-v).toFixed(2)).join('L') +
          'Z'
      )
      .join('')
    rows.push(
      `<text x="8" y="${y}" font-size="4">${label}</text><path fill="#546c67" fill-rule="evenodd" transform="translate(${
        8 - min[0]
      } ${y + 4 + max[1]})" d="${contours}"/>`
    )
    y += max[1] - min[1] + 16
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="${y}mm" viewBox="0 0 200 ${y}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif"><text x="8" y="6" font-size="3.4">Printed joint sections · 1:1 at 100% print scale</text>${rows.join(
    ''
  )}</g></svg>`
}
export function buildKit(kernel, p, f = hardware, screenshot, joints) {
  if (
    ![screenshot, joints].every(
      (image) =>
        image instanceof Uint8Array &&
        image.length >= 24 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => image[i] === v)
    )
  )
    throw Error('A PNG capture of the configured tree is required.')

  const l = frameLayout(p, f),
    parts = frameParts(kernel, p, f, l),
    files = {}
  for (const { name, solid } of parts) {
    if (
      solid.status() !== 'NoError' ||
      solid.volume() <= 0 ||
      solid.decompose().length !== 1
    )
      throw Error('Invalid printable solid: ' + name)
    // A star half often fits the bed diagonally. Export in that print orientation.
    const oriented = name === 'star-socket' ? solid.rotate([90, 0, 0]) : solid
    let printable = oriented
    function fits(shape) {
      const { min, max } = shape.boundingBox()
      return (
        max[0] - min[0] <= f.bed - 2 + 1e-5 &&
        max[1] - min[1] <= f.bed - 2 + 1e-5
      )
    }
    if (!fits(printable)) {
      for (let angle = 1; angle < 90; angle++) {
        printable = oriented.rotate([0, 0, angle])
        if (fits(printable)) break
      }
      if (!fits(printable))
        throw Error(
          name +
            ' exceeds the ' +
            f.bed +
            ' mm bed. Reduce its diameter or increase the bed setting.'
        )
    }
    const { min } = printable.boundingBox()
    files['STL/' + name + '.stl'] = stl(printable.translate(min.map((v) => -v)))
  }
  const cuts = cutSheet(l)
  files['printed-joints.png'] = [joints, { level: 0 }]
  files['tree-render.png'] = [screenshot, { level: 0 }]
  files['CUT-SHEET.txt'] = strToU8(cuts.text)
  files['START-HERE.txt'] = strToU8(
    [
      'MEGA TREE BUILDER',
      '',
      cuts.buy,
      ...cuts.longer,
      '',
      'tree-render.png shows your 3D view. Inspect the fittings in printed-joints.png and joint-sections.svg.',
      '1. Open CUT-SHEET.txt for finished lengths and the cuts to make from each stick.',
      '2. Print one elbow from STL/ and check it on your EMT. Find print quantities in ASSEMBLY.txt.',
      '3. Assemble using ASSEMBLY.txt and the numbered drawing in base-plan.svg.',
      '',
    ].join('\n')
  )
  files['ASSEMBLY.txt'] = strToU8(sheet(p, f, l, parts))
  files['joint-sections.svg'] = strToU8(jointSections(parts, l))
  files['base-plan.svg'] = strToU8(diagram(l))
  files['configuration.json'] = strToU8(
    JSON.stringify({ tree: p, hardware: f }, null, 2)
  )
  return zipSync(files, { level: 6 })
}
