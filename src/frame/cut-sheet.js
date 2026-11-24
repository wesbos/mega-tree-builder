import { sockets } from './base.js'

// Integer 32nds keep the stock plan and the printed tape-measure marks identical.
const unitsPerInch = 32
const stock = 120 * unitsPerInch
const kerf = unitsPerInch / 8
function inches(units) {
  const whole = Math.floor(units / unitsPerInch)
  let numerator = units % unitsPerInch,
    denominator = unitsPerInch
  if (!numerator) return whole + '"'
  while (numerator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }
  return (whole ? whole + ' ' : '') + numerator + '/' + denominator + '"'
}

export function cutSheet({ mast, base }) {
  const groups = new Map()
  function add(part, mm, position) {
    const size = Math.round((mm * unitsPerInch) / 25.4)
    const key = part + '/' + size
    if (!groups.has(key)) groups.set(key, { part, size, positions: [] })
    groups.get(key).positions.push(position)
  }
  add('Mast', mast, 'Centre')
  for (const i of base.braceIndices)
    add(
      'Spoke',
      Math.hypot(...base.vertices[i]) - base.spokeStart - sockets.spokeStop,
      'V' + (i + 1)
    )
  base.edges.forEach((e, i) => {
    const label = 'V' + (i + 1) + '–V' + (((i + 1) % base.edges.length) + 1)
    if (e.split) {
      add(
        'Rail',
        e.split - e.start - sockets.jointGap / 2,
        label + ' first half'
      )
      add(
        'Rail',
        e.length - e.split - e.end - sockets.jointGap / 2,
        label + ' second half'
      )
    } else add('Rail', e.length - e.start - e.end, label)
  })
  const rows = [...groups.values()]
  const sticks = [],
    longer = []
  for (const row of rows.toSorted((a, b) => b.size - a.size)) {
    if (row.size > stock) {
      longer.push(row)
      continue
    }
    for (const _position of row.positions) {
      let stick = sticks.find((s) => s.left >= row.size)
      if (!stick) {
        stick = { left: stock, counts: new Map() }
        sticks.push(stick)
      }
      // If the piece ends at the factory end, no full kerf is needed there.
      stick.left = Math.max(0, stick.left - row.size - kerf)
      stick.counts.set(row, (stick.counts.get(row) || 0) + 1)
    }
  }
  const buy =
    'Buy ' +
    sticks.length +
    ' × 10-foot ' +
    (sticks.length === 1 ? 'stick' : 'sticks') +
    ' of 1" EMT.'
  const longLines = longer.map(
    (row) =>
      'Also buy ' +
      row.positions.length +
      ' longer blank(s) for ' +
      row.part.toLowerCase() +
      ', each at least ' +
      inches(row.size) +
      ' finished. A 10-foot stick is too short.'
  )
  const table = rows.map(
    (row) =>
      String(row.positions.length).padStart(3) +
      '   ' +
      row.part.padEnd(7) +
      '  ' +
      inches(row.size)
  )
  const schedule = sticks.map((s, i) => {
    const pieces = [...s.counts].map(
      ([r, n]) => n + ' × ' + inches(r.size) + ' ' + r.part.toLowerCase()
    )
    return (
      'Stick ' +
      (i + 1) +
      '   ' +
      pieces.join('  +  ') +
      '    |    ' +
      inches(s.left) +
      ' left'
    )
  })
  const locations = rows
    .filter((row) =>
      rows.some((other) => other !== row && other.part === row.part)
    )
    .map((r) => r.part + ' ' + inches(r.size) + '   ' + r.positions.join(', '))
  return {
    buy,
    longer: longLines,
    text: [
      'MEGA TREE BUILDER — EMT CUT SHEET',
      '',
      buy,
      ...longLines,
      '',
      'FINISHED CUTS',
      'Qty   Part       Length',
      ...table,
      '',
      'CUTS BY 10-FOOT STICK',
      ...schedule,
      '',
      'Lengths are rounded to the nearest 1/32". Allow 1/8" saw kerf. Measure each piece from a fresh end and cut on the waste side.',
      ...(locations.length
        ? ['', 'MATCH CUTS TO BASE-PLAN.SVG', ...locations]
        : []),
      '',
    ].join('\n'),
  }
}
