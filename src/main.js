import { frameLayout, savedHardware } from './frame/layout.js'
import { setupFrameDialog } from './frame/dialog.js'
import {
  createIcons,
  Box,
  Download,
  Grid2x2,
  Scan,
  MousePointer2,
  Palette,
  List,
  RotateCcw,
  SlidersHorizontal,
  Zap,
  Cone,
  Grip,
  Star,
  Cpu,
  Plug,
  Activity,
  ZoomIn,
  X,
  Ruler,
  Cable,
  Layers,
} from 'lucide'
import { defaults, calculate, compareBuilds } from './model.js'
import { createPreview } from './scene.js'

const $ = (id) => document.getElementById(id)
const icons = {
  Box,
  Download,
  Grid2x2,
  Scan,
  MousePointer2,
  Palette,
  List,
  RotateCcw,
  SlidersHorizontal,
  Zap,
  Cone,
  Grip,
  Star,
  Cpu,
  Plug,
  Activity,
  ZoomIn,
  X,
  Ruler,
  Cable,
  Layers,
}
const activateIcons = () => createIcons({ icons })
const number = (n, digits = 1) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })
const params = { ...defaults }
const limits = {}
let pattern = 'aurora',
  preview,
  renderFrame = 0,
  fitRequested = false
const stateKey = 'treeform-build-v1'
let saved
try {
  saved = JSON.parse(localStorage.getItem(stateKey))
} catch {
  /* Storage is optional. */
}

const shape = [
  '...x...',
  '..xxx..',
  '...x...',
  '.xxxxx.',
  '..xxx..',
  'xxxxxxx',
  '...x...',
]
document.querySelector('.brandmark').innerHTML = shape
  .flatMap((line, y) =>
    Array.from(line, (c, x) =>
      c === 'x'
        ? '<b style="grid-area:' + (y + 1) + ' / ' + (x + 1) + '"></b>'
        : '',
    ),
  )
  .join('')

function field(parent, key, label, unit, min, max, step, sliderMax) {
  limits[key] = { min, max, step }
  const value = saved?.params?.[key]
  if (valid(key, value)) params[key] = value
  const input =
    '<div class="number"><input id="' +
    key +
    '" type="number" step="' +
    step +
    '" min="' +
    min +
    '" max="' +
    max +
    '" value="' +
    params[key] +
    '"><span>' +
    unit +
    '</span></div>'
  const caption = '<label for="' + key + '">' + label + '</label>'
  const wrapper = document.createElement('div')
  wrapper.className = sliderMax ? 'slider-field' : 'single'
  wrapper.innerHTML = sliderMax
    ? '<div class="field-title">' +
      caption +
      input +
      '</div><input id="slide-' +
      key +
      '" type="range" min="' +
      min +
      '" max="' +
      sliderMax +
      '" step="0.25" aria-label="' +
      label +
      ' slider">'
    : caption + input
  $(parent).append(wrapper)
  bindNumber(key)
  if (sliderMax)
    $('slide-' + key).addEventListener('input', (e) => {
      params[key] = Number(e.target.value)
      $(key).value = params[key]
      refresh(key)
    })
}

function valid(key, n) {
  const { min, max, step } = limits[key]
  return (
    Number.isFinite(n) &&
    n >= min &&
    n <= max &&
    (step !== 1 || Number.isInteger(n))
  )
}

function bindNumber(key) {
  const input = $(key)
  input.addEventListener('input', () => {
    const n = input.valueAsNumber
    if (!valid(key, n)) {
      input.setAttribute('aria-invalid', 'true')
      return
    }
    input.removeAttribute('aria-invalid')
    params[key] = n
    refresh(key)
  })
  input.addEventListener('change', () => {
    if (!valid(key, input.valueAsNumber) && (key !== 'angle' || input.value))
      input.reportValidity()
  })
  input.addEventListener('blur', () => {
    input.removeAttribute('aria-invalid')
    input.value =
      key === 'angle' && [180, 270, 360].includes(params.angle)
        ? ''
        : params[key]
  })
}

field('dimensions', 'height', 'Tree height', 'in', 1, 2400, 'any', 240)
field('dimensions', 'top', 'Top diameter', 'in', 0, 1200, 'any', 48)
field('dimensions', 'base', 'Base diameter', 'in', 1, 2400, 'any', 144)
field('string-settings', 'pixelsPerString', 'Pixels per string', '', 2, 2000, 1)
field(
  'string-settings',
  'stringsPerRun',
  'Strings per vertical run',
  '',
  1,
  50,
  1,
)
field('layout', 'strands', 'Vertical runs', '', 2, 512, 1)
field('layout', 'pitch', 'Pixel spacing', 'in', 0.01, 2400, 'any')
field('stock', 'stripWidth', 'Strip width', 'in', 0.1, 24, 'any')
field('stock', 'thickness', 'Thickness', 'in', 0.005, 1, 'any')
field('stock', 'holeDiameter', 'Node hole', 'mm', 1, 50, 'any')
field('stock', 'holePitch', 'Hole spacing', 'in', 0.1, 12, 'any')
field('stock', 'tail', 'Tail per end', 'in', 0, 120, 'any')
field('stock', 'rollFeet', 'Roll length', 'ft', 1, 5000, 'any')
field('topper', 'starWidth', 'Star width', 'in', 1, 240, 'any')
field('topper', 'starPixels', 'Star pixels', '', 5, 2500, 1)
field(
  'current',
  'milliamps',
  'Full-white draw per pixel',
  'mA',
  0.1,
  1000,
  'any',
)
field('supply', 'volts', 'DC voltage', 'V', 1, 60, 'any')
field('supply', 'watts', 'Rated output', 'W', 1, 100000, 'any')
limits.angle = { min: 0.01, max: 360, step: 'any' }
if (valid('angle', saved?.params?.angle)) params.angle = saved.params.angle
bindNumber('angle')
$('angle').placeholder = 'Custom'
if (typeof saved?.params?.star === 'boolean') params.star = saved.params.star
if (['aurora', 'warm', 'candy'].includes(saved?.pattern))
  pattern = saved.pattern

const row = (name, value) =>
  '<div class="row"><span>' +
  name +
  '</span><strong>' +
  value +
  '</strong></div>'
const metrics = [
  ['grip', 'Total pixels'],
  ['cable', 'Per run'],
  ['ruler', 'Strip length'],
  ['zap', 'Power draw'],
]
$('summary').innerHTML = metrics
  .map(
    ([icon, label], i) =>
      '<div class="metric"><div class="metric-label"><i data-lucide="' +
      icon +
      '"></i>' +
      label +
      '</div><strong id="metric-' +
      i +
      '"></strong><small id="sub-' +
      i +
      '"></small></div>',
  )
  .join('')

// Use fabrication dimensions wherever a printable frame exists. The geometric
// calculator remains available for custom designs outside the fitting limits.
function physicalLayout(p) {
  try {
    return frameLayout(p, savedHardware())
  } catch {
    return null
  }
}
function quantities(m, l, p) {
  if (!l) return m
  const cut = l.cut / 25.4,
    cutsPerRoll = Math.floor((p.rollFeet * 12) / cut + 1e-9)
  return {
    ...m,
    cut,
    stockLength: cut * p.strands,
    cutsPerRoll,
    rolls: cutsPerRoll ? Math.ceil(p.strands / cutsPerRoll) : Infinity,
  }
}
function buildSections(m) {
  const p = params,
    layout = physicalLayout(p)
  m = quantities(m, layout, p)
  return {
    ...(layout
      ? {
          'Printed frame': [
            ['Base rails', layout.base.edges.length],
            ['Crown outside diameter', number(layout.topR / 12.7, 2) + ' in'],
            ['Rail wrap diameter', number(layout.base.wrapR / 12.7, 2) + ' in'],
            [
              'Height from rail axis to crown rim',
              number(layout.rise / 25.4, 2) + ' in',
            ],
            [
              'Vertical distance between LED rows',
              number((p.pitch * layout.rise) / layout.span, 3) + ' in',
            ],
            ['Ball bungees, top and bottom', 2 * p.strands],
          ],
        }
      : {}),
    'Nominal tree geometry': [
      ['Height between rings', number(p.height) + ' in'],
      ['Top / base diameter', number(p.top) + ' / ' + number(p.base) + ' in'],
      ['Wrap angle', p.angle + '°'],
      ['Vertical runs', p.strands],
      [
        'Top / base arc spacing',
        number(m.topGap, 2) + ' / ' + number(m.baseGap, 2) + ' in',
      ],
      ['Covered base arc', number(m.arc) + ' in'],
    ],
    'Pixels and mounting strip': [
      ['Pixel spacing', p.pitch + ' in'],
      ['Pixels per factory string', number(p.pixelsPerString)],
      ['Lit pixels per vertical run', number(m.perStrand)],
      [
        'Factory strings per run (dedicated)',
        Math.ceil(m.perStrand / p.pixelsPerString),
      ],
      [
        'Unused pixels per dedicated run',
        (p.pixelsPerString - (m.perStrand % p.pixelsPerString)) %
          p.pixelsPerString,
      ],
      [
        'Tree / topper pixels',
        number(m.treePixels) + ' / ' + (p.star ? p.starPixels : 0),
      ],
      ...(p.star ? [['Star width', p.starWidth + ' in']] : []),
      ['Total pixels', number(m.total)],
      ['Ring-to-ring strand length', number(m.length, 2) + ' in'],
      ['Unused span per end', number(m.leftover / 2, 2) + ' in'],
      ['Strip width × thickness', p.stripWidth + ' × ' + p.thickness + ' in'],
      [
        'Hole diameter / pitch',
        p.holeDiameter + ' mm / ' + p.holePitch + ' in',
      ],
      ['Tail at each end', p.tail + ' in'],
      ['Cut length per strip', number(m.cut, 2) + ' in'],
      ['Total cut strip', number(m.stockLength / 12, 2) + ' ft'],
      ['Complete cuts per ' + p.rollFeet + ' ft roll', m.cutsPerRoll],
      [
        'Rolls for all strands',
        Number.isFinite(m.rolls) ? m.rolls : 'Strand exceeds roll length',
      ],
      ['Hole placement', pitchDescription(m)],
    ],
    'Power at full white': [
      ['Pixel type', 'WS2811 bullet'],
      ['Draw per pixel', p.milliamps + ' mA'],
      ['DC supply', p.volts + ' V / ' + number(p.watts) + ' W'],
      ['DC supply capacity', number(m.capacity, 2) + ' A'],
      [
        'Estimated DC draw',
        number(m.draw, 2) + ' W / ' + number(m.amps, 2) + ' A',
      ],
      ['Supply load', number(m.load, 2) + '%'],
      [
        m.remaining < 0 ? 'Over capacity' : 'Available output',
        number(Math.abs(m.remaining), 2) + ' W',
      ],
    ],
  }
}

function pitchDescription(m) {
  const n = Math.round(params.pitch / params.holePitch)
  if (!m.onPitch) return 'Custom pitch requires a different hole pattern.'
  if (n === 1) return 'Uses every mounting hole.'
  if (n === 2) return 'Uses every second mounting hole.'
  return 'Uses one of every ' + n + ' mounting holes.'
}

let brightness = Number.isFinite(saved?.brightness)
  ? Math.max(0, Math.min(100, saved.brightness))
  : 65
let showPerson = saved?.showPerson !== false
let inventory =
  Number.isInteger(saved?.inventory) && saved.inventory > 0
    ? saved.inventory
    : 1300
let fullStrands =
  Number.isInteger(saved?.fullStrands) &&
  saved.fullStrands >= 4 &&
  saved.fullStrands <= 512
    ? saved.fullStrands
    : 24
let choices = []
function showBrightness() {
  $('dimmer').value = brightness
  $('dimmer').style.setProperty('--fill', brightness + '%')
  $('brightness-value').value = brightness + '%'
  preview?.setBrightness(brightness)
}
$('dimmer').oninput = (e) => {
  brightness = e.target.valueAsNumber
  showBrightness()
  save()
}
$('person').checked = showPerson
$('person').oninput = (e) => {
  showPerson = e.target.checked
  preview?.showPerson(showPerson)
  save()
}

function markCurrentPreset() {
  for (const button of $('choices').querySelectorAll('[data-choice]')) {
    const g = choices[button.dataset.choice].geometry
    const selected =
      g.angle === params.angle &&
      g.strands === params.strands &&
      g.pitch === params.pitch &&
      Math.abs(g.height - params.height) < 0.02 &&
      Math.abs(g.base - params.base) < 0.02
    button.setAttribute('aria-pressed', selected)
  }
}

function showChoices() {
  const valid = $('budget').validity.valid && $('full-strands').validity.valid
  choices = valid ? compareBuilds(params, inventory, fullStrands) : []
  const reserved = params.star ? params.starPixels : 0
  const size = params.pixelsPerString
  const loose = inventory % size
  const whole = Math.floor(inventory / size)
  $('planner-note').textContent = valid
    ? `${number(whole)} whole ${size}-pixel strings${loose ? ' + ' + loose + ' loose pixels' : ''}. ${reserved ? reserved + ' pixels reserved for the star. ' : ''}Each run uses ${number(size * params.stringsPerRun)} pixels.`
    : ''
  $('choices').replaceChildren()
  for (const [angle, name] of [
    [180, 'Half circle'],
    [270, 'Three-quarter circle'],
    [360, 'Full circle'],
  ]) {
    const options = choices.filter(({ geometry }) => geometry.angle === angle)
    if (!options.length) continue
    const { geometry: g, result: m } = options[0]
    const spare = inventory - m.total
    const intact = Math.floor(spare / size)
    const remainder = spare % size
    const spareLabel =
      [
        intact
          ? number(intact) + ' whole string' + (intact === 1 ? '' : 's')
          : '',
        remainder ? number(remainder) + ' pixels' : '',
      ]
        .filter(Boolean)
        .join(' + ') || '0 pixels'
    const section = document.createElement('section')
    section.innerHTML = `<h3>${angle}° · ${name}</h3>
      <div class="preset-cards" role="group" aria-label="${angle} degree presets"></div>
      <p class="preset-meta">${g.strands} runs × ${m.perStrand} pixels · ${number(m.total)} pixels total · <span class="${m.load > 100 ? 'warning' : ''}">${number(m.draw)} W</span><br>Spare: ${spareLabel}</p>`
    const cards = section.querySelector('.preset-cards')
    for (const option of options) {
      const { pitch, height, base } = option.geometry
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.choice = choices.indexOf(option)
      button.setAttribute(
        'aria-label',
        `${angle}°, ${number(pitch, 2)} in spacing, ${number(height / 12, 1)} ft tall, ${number(base / 12, 1)} ft base`,
      )
      button.innerHTML = `<span>${number(pitch, 2)} in spacing</span><strong>${number(height / 12, 1)} ft</strong><small>Ø ${number(base / 12, 1)} ft</small>`
      cards.append(button)
    }
    $('choices').append(section)
  }
  $('planner-status').textContent = !valid
    ? 'Enter a whole number within each field’s range.'
    : !choices.length
      ? 'No frames fit these settings. Try more pixels or fewer strings per run.'
      : `Heights exclude the star. Presets start at your requested ${number(params.top, 2)} in top diameter and a base diameter of ${number((params.base / params.height) * 100)}% of the frame height.`
  markCurrentPreset()
}

$('budget').value = inventory
$('full-strands').value = fullStrands
function updateInventory() {
  if ($('budget').validity.valid) inventory = $('budget').valueAsNumber
  if ($('full-strands').validity.valid)
    fullStrands = $('full-strands').valueAsNumber
  showChoices()
  save()
}
$('budget').oninput = updateInventory
$('full-strands').oninput = updateInventory
$('choices').onclick = (e) => {
  const button = e.target.closest('[data-choice]')
  if (!button) return
  const { geometry } = choices[button.dataset.choice]
  Object.assign(params, geometry)
  for (const [key, value] of Object.entries(geometry)) $(key).value = value
  fitRequested = 'reset'
  refresh('preset')
}
function save() {
  try {
    localStorage.setItem(
      stateKey,
      JSON.stringify({
        params,
        pattern,
        brightness,
        showPerson,
        inventory,
        fullStrands,
      }),
    )
  } catch {
    /* Private browsing can disable storage. */
  }
}
function refresh(key) {
  if (key === 'preset') markCurrentPreset()
  else showChoices()
  const p = params,
    layout = physicalLayout(p),
    m = quantities(calculate(p), layout, p)
  for (const name of ['height', 'top', 'base']) {
    const s = $('slide-' + name)
    s.value = p[name]
    s.style.setProperty(
      '--fill',
      (100 * (s.value - s.min)) / (s.max - s.min) + '%',
    )
  }
  $('star').checked = p.star
  $('topper').hidden = !p.star
  $('wrap-caption').textContent =
    { 180: 'Half circle', 270: 'Three-quarter circle', 360: 'Full circle' }[
      p.angle
    ] || 'Partial circle'
  if (document.activeElement !== $('angle'))
    $('angle').value = [180, 270, 360].includes(p.angle) ? '' : p.angle
  document
    .querySelectorAll('[data-angle]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', +b.dataset.angle === p.angle),
    )
  document
    .querySelectorAll('[data-pattern]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.pattern === pattern),
    )
  const layoutNote = [pitchDescription(m)]
  if (m.perStrand % p.pixelsPerString) {
    layoutNote.push(
      `This custom frame fits ${m.perStrand} pixels per run. Choose a preset for whole ${p.pixelsPerString}-pixel strings.`,
    )
  }
  if (layout && layout.upperHoleR * layout.smallestGap < p.stripWidth * 25.4)
    layoutNote.push(
      'Lap the strip edges clockwise at the top. All upper bungees share one row of crown slots.',
    )
  else if (!layout && m.topGap < p.stripWidth)
    layoutNote.push('The strip edges overlap near the crown.')
  $('pitch-note').textContent = layoutNote.join(' ')
  $('pitch-note').classList.toggle('warning', !m.onPitch)
  const summary = [
    [
      number(m.total),
      '',
      p.star ? 'Includes ' + p.starPixels + ' in star' : 'Tree pixels',
    ],
    [number(m.perStrand), 'px', number(p.strands) + ' vertical runs'],
    [
      number(m.stockLength / 12),
      'ft',
      Number.isFinite(m.rolls)
        ? m.rolls + ' × ' + p.rollFeet + ' ft roll' + (m.rolls === 1 ? '' : 's')
        : 'Cut exceeds roll',
    ],
    [number(m.draw), 'W', number(m.load) + '% of supply'],
  ]
  summary.forEach(([value, unit, sub], i) => {
    $('metric-' + i).innerHTML = value + ' <span>' + unit + '</span>'
    $('sub-' + i).textContent = sub
  })
  $('sub-3').classList.toggle('warning', m.load > 100)
  $('power-readout').innerHTML =
    row('Estimated draw', number(m.draw) + ' W · ' + number(m.amps, 2) + ' A') +
    row('Supply load', number(m.load) + '%') +
    '<progress max="100" value="' +
    Math.min(100, m.load) +
    '" aria-label="Supply load"></progress>' +
    row(
      m.remaining < 0 ? 'Over capacity' : 'Available output',
      number(Math.abs(m.remaining)) + ' W',
    ) +
    '<p class="note">Includes all tree and topper pixels at full white. Preview colors do not change this estimate.</p>'
  if (
    key !== 'milliamps' &&
    key !== 'volts' &&
    key !== 'watts' &&
    key !== 'rollFeet' &&
    key !== 'pixelsPerString' &&
    key !== 'stringsPerRun'
  ) {
    if (['height', 'base', 'top', 'starWidth', 'star'].includes(key))
      fitRequested = true
    if (!renderFrame)
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0
        if (preview) {
          const skip = preview.update(p, pattern, fitRequested)
          $('density-note').hidden = skip === 1
        }
        fitRequested = false
      })
  }
  save()
}
$('canvas').insertAdjacentHTML(
  'afterend',
  '<div id="density-note" hidden>Dense build · sampled preview</div>',
)
document.querySelectorAll('[data-angle]').forEach(
  (b) =>
    (b.onclick = () => {
      params.angle = +b.dataset.angle
      refresh('angle')
    }),
)
document.querySelectorAll('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('[data-tab]').forEach((t) => {
        const selected = t === b
        t.setAttribute('aria-pressed', selected)
        $(t.dataset.tab).hidden = !selected
      })
    }),
)
document.querySelectorAll('[data-pattern]').forEach(
  (b) =>
    (b.onclick = () => {
      pattern = b.dataset.pattern
      refresh('pattern')
    }),
)
$('star').oninput = (e) => {
  params.star = e.target.checked
  refresh('star')
}
$('reset').onclick = () => {
  Object.assign(params, defaults)
  for (const key of Object.keys(limits)) $(key).value = params[key]
  pattern = 'aurora'
  fitRequested = 'reset'
  refresh()
}
$('details').onclick = () => {
  $('detail-body').innerHTML = Object.entries(buildSections(calculate(params)))
    .map(
      ([heading, values]) =>
        '<h3>' + heading + '</h3>' + values.map(([k, v]) => row(k, v)).join(''),
    )
    .join('')
  $('sheet').showModal()
}
$('close').onclick = () => $('sheet').close()
$('sheet').onclick = (e) => {
  if (e.target === $('sheet')) $('sheet').close()
}
$('export').onclick = () => {
  const content =
    'Mega Tree Builder · Build sheet\n\n' +
    Object.entries(buildSections(calculate(params)))
      .map(
        ([heading, rows]) =>
          heading + '\n' + rows.map(([k, v]) => k + ': ' + v).join('\n'),
      )
      .join('\n\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: 'mega-tree-build.txt',
  })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
setupFrameDialog(params, () => refresh('frame'))
activateIcons()
try {
  preview = createPreview($('canvas'), showPerson)
  showBrightness()
  $('inspect').onclick = (e) => {
    const active = preview.inspect()
    e.currentTarget.setAttribute('aria-pressed', active)
    $('dimmer').disabled = active
    $('person').disabled = active
    $('view-label').textContent = active
      ? 'Strip detail · lights off'
      : '3D preview'
  }
  $('hardware-view').onchange = (e) => preview.setFocus(e.target.value)
  $('fit').onclick = () => preview.fit()
  $('grid').onclick = (e) =>
    e.currentTarget.setAttribute('aria-pressed', preview.grid())
} catch (error) {
  console.error(error)
  $('canvas').innerHTML =
    '<p class="render-error">3D preview requires WebGL 2. Enable hardware acceleration to view your tree.</p>'
}
fitRequested = 'reset'
refresh()
