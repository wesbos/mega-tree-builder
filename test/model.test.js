import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculate,
  defaults,
  strandAngle,
  compareBuilds,
} from '../src/model.js'

test('counts lit endpoints at the exact pitch along a sloped strip', () => {
  const m = calculate({
    ...defaults,
    height: 12,
    top: 2,
    base: 12,
    pitch: 2,
    strands: 8,
    star: false,
  })
  assert.equal(m.length, 13)
  assert.equal(m.perStrand, 7)
  assert.equal(m.leftover, 1)
  assert.equal(m.total, 56)
})
test('partial wraps include both edges and full wraps have a single seam', () => {
  const p = { ...defaults, strands: 4, angle: 180 }
  assert.equal(strandAngle(p, 0), -Math.PI / 2)
  assert.equal(strandAngle(p, 3), Math.PI / 2)
  assert.ok(Math.abs(calculate(p).baseGap - (Math.PI * p.base) / 6) < 1e-10)
  p.angle = 360
  assert.equal(strandAngle(p, 3) - strandAngle(p, 0), 1.5 * Math.PI)
  assert.ok(Math.abs(calculate(p).baseGap - (Math.PI * p.base) / 4) < 1e-10)
})
test('counts whole cuts per roll including two attachment tails', () => {
  const m = calculate({
    ...defaults,
    height: 58,
    base: 20,
    top: 20,
    tail: 2,
    rollFeet: 10,
    strands: 2,
  })
  assert.equal(m.cut, 62)
  assert.equal(m.rolls, 2)
  assert.equal(m.cutsPerRoll, 1)
  assert.equal(calculate({ ...defaults, rollFeet: 1 }).cutsPerRoll, 0)
})
test('default DC load includes the star and uses the 900 W rating', () => {
  const m = calculate(defaults)
  assert.equal(m.total, 1240)
  assert.equal(m.capacity, 75)
  assert.equal(m.amps, 62)
  assert.equal(m.draw, 744)
  assert.ok(calculate({ ...defaults, pitch: 1 }).remaining < 0)
})
test('flags fractional hole steps while retaining the custom design pitch', () => {
  assert.equal(calculate({ ...defaults, pitch: 1.5 }).onPitch, false)
  assert.equal(
    calculate({ ...defaults, pitch: 1.5, holePitch: 0.5 }).onPitch,
    true,
  )
})

test('inventory builds preserve the pixel budget, angular density, and star allocation', () => {
  const options = compareBuilds(defaults, 1300, 24)
  assert.equal(options.length, 9)
  for (const { geometry: g, result: m } of options) {
    assert.deepEqual(calculate({ ...defaults, ...g }), m)
    assert.equal(m.perStrand, 50)
    assert.ok(m.total <= 1300)
    assert.ok(
      Math.abs(g.base / g.height - defaults.base / defaults.height) < 0.001,
    )
    assert.ok(m.leftover < 0.02)
  }
  assert.deepEqual(
    options
      .filter((o) => o.geometry.pitch === 1)
      .map((o) => o.geometry.strands),
    [13, 19, 24],
  )
  assert.deepEqual(compareBuilds(defaults, 40, 24), [])
  assert.equal(
    compareBuilds({ ...defaults, star: false }, 1300, 26).at(-1).result.total,
    1300,
  )
})

test('joined strings cap runs after reserving the star and leave a whole string plus 10 spare nodes', () => {
  const builds = compareBuilds({ ...defaults, stringsPerRun: 2 }, 1300, 24)
  assert.equal(builds.length, 9)
  for (const { geometry, result } of builds) {
    assert.equal(geometry.strands, 12)
    assert.equal(result.perStrand, 100)
    assert.equal(result.total, 1240)
    assert.equal(1300 - result.total, 60)
  }
  assert.equal(
    compareBuilds({ ...defaults, stringsPerRun: 2 }, 239, 24).length,
    0,
  )
  assert.equal(
    compareBuilds({ ...defaults, pixelsPerString: 60 }, 1300, 24).at(-1).result
      .perStrand,
    60,
  )
})
