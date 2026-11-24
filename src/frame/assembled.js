import { sockets } from './base.js'
import * as T from 'three'
import { frameLayout } from './layout.js'
import { panelScrews } from './solids.ts'
import { strandAngle } from '../model.js'

const v = (x, y, z) => new T.Vector3(x, y, z)
const unit = v(1, 1, 1),
  up = v(0, 1, 0),
  tau = 2 * Math.PI
const cadBasis = new T.Matrix4().makeBasis(v(0, 0, 1), v(1, 0, 0), up)
const shift = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z)
const rotateZ = (a) => new T.Matrix4().makeRotationZ(a)
const rotateX = (a) => new T.Matrix4().makeRotationX(a)
const chain = (...seq) =>
  seq.reduce((m, next) => m.multiply(next), new T.Matrix4())
const pose = (at, rotation) => new T.Matrix4().compose(at, rotation, unit)
const coatings = {
  frame: '#b0643d',
  pin: '#34383b',
  screw: '#9099a1',
  tube: '#b8c0c6',
  cord: '#282a2b',
  ball: '#303235',
}
function finish(type) {
  return new T.MeshStandardMaterial({
    color: coatings[type],
    metalness: type === 'tube' || type === 'screw' ? 0.75 : 0.02,
    roughness: type === 'tube' ? 0.32 : 0.62,
    flatShading: type === 'pin',
  })
}
export function previewLayout(p, f) {
  const l = frameLayout(p, f)
  const crownY = sockets.axisHeight + l.rise,
    capZ = crownY - 6
  const starY = l.star ? crownY + l.star.riser - 1 : crownY
  const runs = l.runs.map((run, index) => {
    const a = strandAngle(p, index),
      radial = v(Math.sin(a), 0, Math.cos(a))
    const eye = v(run.anchor[1], sockets.axisHeight, run.anchor[0])
    const rim = radial
      .clone()
      .multiplyScalar(l.topR)
      .addScaledVector(up, crownY)
    const along = rim.clone().sub(eye).normalize(),
      tangent = up.clone().cross(radial)
    const normal = tangent.clone().cross(along).normalize()
    tangent.copy(along).cross(normal).normalize()
    const end = eye.clone().addScaledVector(along, run.reach)
    const lip = rim.clone().addScaledVector(along, -f.topReach)
    return { a, eye, lip, rim, end, along, tangent, normal, radial }
  })
  return { l, crownY, capZ, starY, runs, f }
}

// Keep one mesh set in memory. A changed cut layout supersedes any pending worker.
export function frameMeshCache() {
  let key = '',
    worker,
    meshes,
    receive,
    reject
  return (p, f, callback, fail) => {
    const next = JSON.stringify([
      p.top,
      p.base,
      p.height,
      p.angle,
      p.strands,
      p.star,
      p.starPixels,
      p.starWidth,
      p.holeDiameter,
      p.stripWidth,
      p.pitch,
      p.tail,
      p.thickness,
      p.holePitch,
      f,
    ])
    receive = callback
    reject = fail
    if (next === key && meshes) {
      callback(meshes)
      return
    }
    if (next === key && worker) return
    worker?.terminate()
    key = next
    meshes = null
    worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    })
    const stop = () => {
      worker?.terminate()
      worker = null
    }
    worker.onmessage = ({ data }) => {
      stop()
      if (data.error) {
        key = ''
        reject(data.error)
        return
      }
      meshes = data.meshes
      receive(meshes)
    }
    worker.onerror = (e) => {
      stop()
      key = ''
      reject(e.message)
    }
    worker.postMessage({ tree: { ...p }, hardware: f, preview: true })
  }
}

export function addAssembly(parent, p, assembly, meshes) {
  const { l, crownY, capZ, starY, runs, f } = assembly
  const group = new T.Group()
  group.scale.setScalar(0.001)
  parent.add(group)
  const byName = new Map(),
    sets = new Map()
  const coat = (t) => {
    if (!sets.has(t)) sets.set(t, finish(t))
    return sets.get(t)
  }
  function place(name, mat) {
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(mat)
  }
  const build = (geometry, type, matrix) => {
    const obj = new T.Mesh(geometry, coat(type))
    obj.applyMatrix4(matrix)
    group.add(obj)
  }
  const Y = v(0, 1, 0)
  const rod = (a, b) => {
    const delta = b.clone().sub(a)
    build(
      new T.CylinderGeometry(f.od / 2, f.od / 2, delta.length(), 32),
      'tube',
      pose(
        a.clone().lerp(b, 0.5),
        new T.Quaternion().setFromUnitVectors(Y, delta.normalize())
      )
    )
  }
  // Screw origin is the bearing surface under its head. The shaft points down local Z.
  function screw(base, length = 9.5) {
    const head = new T.CylinderGeometry(4, 4, 2.2, 16).rotateX(Math.PI / 2)
    build(head, 'screw', chain(base, shift(0, 0, 1.1)))
    build(
      new T.CylinderGeometry(2, 2, length, 12).rotateX(Math.PI / 2),
      'screw',
      chain(base, shift(0, 0, -length / 2))
    )
  }
  const z0 = sockets.axisHeight
  const base = l.base
  const vertex = (i) => {
    const [x, y] = base.vertices[i % base.vertices.length]
    return v(y, z0, x)
  }
  const centre = v(0, z0, 0)
  place('mast-base', chain(cadBasis, shift(0, 0, z0)))
  const retainingScrew = (point) =>
    screw(chain(cadBasis, shift(point.z, point.x, z0 + f.od / 2 + 9.5)))
  base.edges.forEach((edge, i) => {
    const here = vertex(i),
      next = vertex(i + 1),
      dir = next.clone().sub(here).normalize()
    const at = (t) => here.clone().addScaledVector(dir, t)
    const joint = base.joints[i]
    place(
      joint.name,
      chain(cadBasis, shift(here.z, here.x, z0), rotateZ(joint.inward))
    )
    if (joint.brace) {
      const ray = here.clone().sub(centre).normalize()
      rod(
        centre.clone().addScaledVector(ray, base.spokeStart),
        here.clone().addScaledVector(ray, -sockets.spokeStop)
      )
      if (base.bridgeEdges.length) {
        retainingScrew(centre.clone().addScaledVector(ray, base.hubMouth - 10))
        retainingScrew(
          here.clone().addScaledVector(ray, -(sockets.spokeMouth - 10))
        )
      }
    }
    if (base.bridgeEdges.includes(i)) {
      retainingScrew(at(edge.start + 12))
      retainingScrew(at(edge.length - edge.end - 12))
    }
    if (edge.split) {
      rod(at(edge.start), at(edge.split - sockets.jointGap / 2))
      rod(at(edge.split + sockets.jointGap / 2), at(edge.length - edge.end))
      const basis = new T.Matrix4().makeBasis(up, dir.clone().cross(up), dir)
      basis.setPosition(at(edge.split))
      place('sliding-union', basis)
      for (const z of [-10, 10])
        screw(
          chain(
            basis,
            shift(f.od / 2 + 7, 0, z),
            new T.Matrix4().makeRotationY(Math.PI / 2)
          )
        )
    } else rod(at(edge.start), at(edge.length - edge.end))
  })
  const radialScrew = new T.Matrix4().makeRotationY(Math.PI / 2)
  screw(chain(cadBasis, shift(24, 0, z0 + 50), radialScrew))
  rod(v(0, z0 + 20, 0), v(0, z0 + 20 + l.mast, 0))
  const hub = chain(cadBasis, shift(0, 0, capZ))
  place(l.crownSections === 1 ? 'mast-crown' : 'mast-collar', hub)
  for (const a of [0, Math.PI])
    screw(chain(hub, rotateZ(a), shift(24, 0, 26), radialScrew))
  if (l.crownSections > 1)
    for (let i = 0; i < l.crownSections; i++) {
      place('crown-panel-' + (i + 1), hub)
      const arc = tau / l.crownSections
      for (const [x, y] of panelScrews(l.crownPhase + i * arc, arc, 36))
        screw(chain(hub, shift(x, y, 6)), 12.7)
    }
  const cordRadius = f.cord / 2,
    cords = [],
    ballMatrices = []
  const ballGeo = new T.SphereGeometry(f.ball / 2, 20, 12)
  for (let i = 0; i < runs.length; i++) {
    const { eye, end, lip, rim, radial, tangent, normal } = runs[i],
      mark = l.runs[i]
    const axis = vertex(mark.side + 1)
      .sub(vertex(mark.side))
      .normalize()
    const outside = axis.clone().cross(up).normalize()
    const pipeRadius = f.od / 2 + cordRadius
    const ball = end
      .clone()
      .addScaledVector(normal, f.ball / 2 + p.thickness * 12.7)
    ballMatrices.push(shift(...ball.toArray()))
    for (const sign of [-1, 1]) {
      const offset = axis.clone().multiplyScalar(sign * (cordRadius + 0.1))
      const bend = []
      // Trace the underside of the exposed rail at the actual tube radius.
      for (let j = 0; j <= 8; j++) {
        const a = (j * Math.PI) / 8
        bend.push(
          eye
            .clone()
            .add(offset)
            .addScaledVector(outside, -pipeRadius * Math.cos(a))
            .addScaledVector(up, -pipeRadius * Math.sin(a))
        )
      }
      const path = new T.CatmullRomCurve3(
        [
          ball.clone().addScaledVector(tangent, sign * 1.5),
          end.clone().addScaledVector(tangent, sign * cordRadius),
          end
            .clone()
            .addScaledVector(normal, -5)
            .addScaledVector(tangent, sign * cordRadius),
          ...bend,
          ball.clone().addScaledVector(tangent, sign * f.ball * 0.5),
          ball.clone().addScaledVector(up, f.ball * 0.52),
        ],
        false,
        'centripetal'
      )
      cords.push(new T.TubeGeometry(path, 40, cordRadius, 7, false))
    }
    const topBall = lip
      .clone()
      .addScaledVector(normal, f.ball / 2 + p.thickness * 12.7)
    ballMatrices.push(shift(...topBall.toArray()))
    const slit = rim.clone().addScaledVector(radial, l.slotRadius - l.topR)
    for (const sign of [-1, 1]) {
      const offset = tangent.clone().multiplyScalar(sign * (cordRadius + 0.1))
      const path = new T.CatmullRomCurve3(
        [
          topBall.clone().add(offset),
          lip.clone().add(offset),
          lip.clone().add(offset).addScaledVector(normal, -5),
          slit.clone().add(offset).addScaledVector(up, -7),
          slit
            .clone()
            .add(offset)
            .addScaledVector(up, cordRadius + 0.4),
          rim
            .clone()
            .add(offset)
            .addScaledVector(up, cordRadius + 0.4),
          rim
            .clone()
            .add(offset)
            .addScaledVector(radial, cordRadius + 0.4)
            .addScaledVector(up, -2),
          topBall.clone().addScaledVector(tangent, sign * f.ball * 0.5),
          topBall.clone().addScaledVector(up, -f.ball * 0.52),
        ],
        false,
        'centripetal'
      )
      cords.push(new T.TubeGeometry(path, 36, cordRadius, 7, false))
    }
  }
  const balls = new T.InstancedMesh(ballGeo, coat('ball'), ballMatrices.length)
  ballMatrices.forEach((m, i) => balls.setMatrixAt(i, m))
  group.add(balls)
  // Merge all cords into one draw call.
  const vertices = []
  for (const c of cords) {
    const g = c.toNonIndexed()
    vertices.push(...g.attributes.position.array)
    c.dispose()
    g.dispose()
  }
  const wires = new T.BufferGeometry()
  wires.setAttribute('position', new T.Float32BufferAttribute(vertices, 3))
  wires.computeVertexNormals()
  build(wires, 'cord', new T.Matrix4())
  if (l.star) {
    const face = shift(0, starY, 30)
    place('star-socket', chain(face, rotateX(-Math.PI / 2)))
    screw(chain(face, shift(24, -28, -30), radialScrew))
    for (let i = 0; i < l.star.sections; i++) {
      place(l.star.sections === 1 ? 'star-face' : 'star-face-' + (i + 1), face)
      const arc = tau / l.star.sections
      for (const [x, y] of panelScrews(
        l.star.phase + arc * i,
        arc,
        l.star.screwRadius
      ))
        screw(chain(face, shift(x, y, 4)), 12.7)
    }
  }
  for (const [name, matrices] of byName) {
    const { position, normal, index } = meshes[name]
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(position, 3))
    geometry.setIndex(new T.BufferAttribute(index, 1))
    geometry.setAttribute('normal', new T.BufferAttribute(normal, 3))
    const mesh = new T.InstancedMesh(geometry, coat('frame'), matrices.length)
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.name = name
    group.add(mesh)
  }
}
