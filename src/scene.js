import { jointViews } from './frame/joint-views.js'
import { savedHardware } from './frame/layout.js'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import {
  previewLayout,
  addAssembly,
  frameMeshCache,
} from './frame/assembled.js'
import { calculate, strandAngle } from './model.js'

const inch = 0.0254
const up = new T.Vector3(0, 1, 0)
const vec = (x, y, z) => new T.Vector3(x, y, z)
const material = (color, roughness, metalness = 0) =>
  new T.MeshStandardMaterial({ color, roughness, metalness })
const aurora = [
  '#16ffab',
  '#00b8ff',
  '#203bff',
  '#a42bff',
  '#fb2999',
  '#6644ff',
  '#16ffab',
].map((c) => new T.Color(c))

function lightColor(pattern, t, angle) {
  if (pattern === 'warm') return new T.Color('#ffb869')
  if (pattern === 'candy')
    return new T.Color(Math.sin(t * 19 + angle * 2) > 0 ? '#ff2241' : '#ffebd9')
  const phase =
    T.MathUtils.euclideanModulo(
      t * 1.32 + (angle / (2 * Math.PI)) * 0.72 + 0.04,
      1,
    ) *
    (aurora.length - 1)
  return aurora[Math.floor(phase)]
    .clone()
    .lerp(aurora[Math.floor(phase) + 1], phase % 1)
}

export function createPreview(container, personEnabled) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  container.append(renderer.domElement)
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive LED tree in a nighttime field',
  )
  const scene = new T.Scene()
  scene.background = new T.Color('#122027')
  const camera = new T.PerspectiveCamera(36, 1, 0.01, 1200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enablePan = true
  controls.minDistance = 0.09
  controls.maxPolarAngle = Math.PI * 0.492
  controls.zoomToCursor = false
  const target = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    samples: 4,
  })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.38, 0.25, 0.95)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  const render = () => composer.render()
  controls.addEventListener('change', render)
  const ambient = new T.HemisphereLight('#dae6ff', '#536341', 1.2)
  const key = new T.DirectionalLight('#dce6ff', 1.6)
  key.position.set(-3, 6, 3)
  scene.add(ambient, key)

  let model = new T.Group(),
    modelHeight = 2,
    modelWidth = 1.3,
    ground
  scene.add(model)
  const fieldTint = { value: new T.Color('#48c0d8') }
  const footprint = { value: 0.65 }
  const assets = new T.LoadingManager()
  const assetsReady = new Promise(resolve => { assets.onLoad = resolve })
  const photo = new T.TextureLoader(assets).load(
    '/textures/preller-drive.webp',
    () => {
      photo.colorSpace = T.SRGBColorSpace
      photo.anisotropy = 4
      const environment = photo.clone()
      environment.mapping = T.EquirectangularReflectionMapping
      environment.needsUpdate = true
      scene.environment = environment
      scene.environmentIntensity = 0.5
      ground = new GroundedSkybox(photo, 1.8, 310, 128)
      ground.position.y = 1.795
      ground.rotation.y = 0.84
      ground.material.color.setRGB(0.17, 0.19, 0.29)
      ground.material.onBeforeCompile = (shader) => {
        shader.uniforms.footprint = footprint
        shader.uniforms.fieldTint = fieldTint
        shader.vertexShader =
          'varying vec3 fieldPosition;\n' +
          shader.vertexShader.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\nfieldPosition=(modelMatrix*vec4(transformed,1.)).xyz;',
          )
        shader.fragmentShader =
          'varying vec3 fieldPosition; uniform float footprint; uniform vec3 fieldTint;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
        float radius = length(fieldPosition.xz) / footprint;
        float spill = exp(-pow((radius - 0.88)/0.66, 2.0)) * exp(-abs(fieldPosition.y)*3.0);
        diffuseColor.rgb *= 1.0 + spill * fieldTint * 8.0;
        diffuseColor.rgb *= mix(0.45,1.0,smoothstep(0.0,0.90,radius));`,
          )
      }
      ground.renderOrder = -1
      scene.add(ground)
      render()
    },
  )
  const grid = new T.GridHelper(60, 120, '#8caca1', '#587c69')
  grid.position.y = 0.003
  grid.material.transparent = true
  grid.material.opacity = 0.23
  grid.visible = false
  scene.add(grid)

  const personHeight = 70 * inch
  const person = new T.Group()
  scene.add(person)
  let personHalfWidth = 0.32
  const shadow = new T.Mesh(
    new T.PlaneGeometry(0.78, 0.54),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader:
        'varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 coord;void main(){float r=length((coord-.5)*2.);gl_FragColor=vec4(0.,0.,0.,.48*(1.-smoothstep(.18,1.,r)));}',
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.001
  person.add(shadow)
  new GLTFLoader(assets).load('/models/scale-person-wes.glb', ({ scene: figure }) => {
    figure.rotation.y = -0.32
    const bounds = new T.Box3().setFromObject(figure, true)
    const scale = personHeight / (bounds.max.y - bounds.min.y)
    const center = bounds.getCenter(new T.Vector3())
    figure.scale.setScalar(scale)
    figure.position.set(
      -center.x * scale,
      -bounds.min.y * scale,
      -center.z * scale,
    )
    personHalfWidth = ((bounds.max.x - bounds.min.x) * scale) / 2
    person.add(figure)
    positionPerson()
    render()
  })
  function positionPerson() {
    person.position.x = modelWidth / 2 + 0.26 + personHalfWidth
    person.visible = personEnabled && !inspection
  }
  let brightness = 65,
    applyLighting
  let inspection = false,
    latest,
    latestPattern,
    detailTarget = vec(0, 1, 0),
    detailNormal = vec(0, 0, 1)
  function frame(reset = true) {
    if (inspection) {
      controls.target.copy(detailTarget)
      camera.position.copy(detailTarget).addScaledVector(detailNormal, 0.21)
      controls.update()
      render()
      return
    }
    const vFov = T.MathUtils.degToRad(camera.fov) / 2
    const frameHeight = person.visible
      ? Math.max(personHeight, modelHeight)
      : modelHeight
    const rightEdge = person.visible
      ? person.position.x + personHalfWidth
      : modelWidth / 2
    const frameWidth = modelWidth / 2 + rightEdge
    const distance =
      (Math.max(frameHeight / 2, frameWidth / (2 * camera.aspect)) /
        Math.tan(vFov)) *
        1.16 +
      modelWidth * 0.2
    const direction = reset
      ? vec(0.095, 0.095, 1).normalize()
      : camera.position.clone().sub(controls.target).normalize()
    controls.target.set((rightEdge - modelWidth / 2) / 2, frameHeight * 0.48, 0)
    camera.position.copy(controls.target).addScaledVector(direction, distance)
    controls.maxDistance = Math.max(15, distance * 4)
    controls.update()
    render()
  }
  new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    frame(false)
  }).observe(container)

  const loadFrame = frameMeshCache()
  let frameReady, settleFrame
  let assembly,
    focus = 'tree'
  const frameStatus = document.getElementById('hardware-status')
  function focusFrame() {
    if (!assembly || focus === 'tree') {
      frame()
      return
    }
    const frontRun = assembly.runs.reduce((front, run) =>
      run.eye.z > front.eye.z ? run : front,
    )
    const position =
      focus === 'base'
        ? frontRun.eye.clone().lerp(frontRun.end, 0.45).multiplyScalar(0.001)
        : vec(
            0,
            (focus === 'star' ? assembly.starY : assembly.crownY) * 0.001,
            0,
          )
    const size =
      focus === 'base'
        ? 0.24
        : focus === 'star'
          ? Math.max(0.24, latest.starWidth * inch * 1.05)
          : Math.max(0.2, assembly.l.topR * 0.0024)
    controls.target.copy(position)
    const direction = focus === 'star' ? vec(0.8, 0.35, -1) : vec(0.62, 0.72, 1)
    camera.position
      .copy(position)
      .addScaledVector(
        direction.normalize(),
        (size / Math.tan(T.MathUtils.degToRad(camera.fov) / 2)) * 0.75,
      )
    controls.update()
    render()
  }
  function update(p, pattern, fit) {
    settleFrame?.(false)
    frameReady = new Promise(resolve => { settleFrame = resolve })
    latest = p
    latestPattern = pattern
    // Short pitches put several bright emitters inside the same bloom kernel.
    const spacing = T.MathUtils.smoothstep(p.pitch, 1, 2)
    bloom.radius = 0.25 * spacing
    bloom.threshold = T.MathUtils.lerp(1.6, 0.95, spacing)
    ambient.intensity = inspection ? 2 : 1.2
    key.intensity = inspection ? 3 : 1.6
    const old = model
    scene.remove(old)
    const geometries = new Set(),
      materials = new Set()
    old.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry)
      if (o.material) materials.add(o.material)
      if (o.isInstancedMesh) o.dispose()
    })
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    model = new T.Group()
    scene.add(model)
    const hardware = savedHardware()
    try {
      assembly = previewLayout(p, hardware)
      frameStatus.textContent = 'Loading printed hardware…'
    } catch (error) {
      assembly = null
      settleFrame(false)
      frameStatus.textContent = 'Nominal preview · ' + error.message
      focus = 'tree'
    }
    const hardwareView = document.getElementById('hardware-view')
    hardwareView.disabled = !assembly || inspection
    hardwareView.querySelector('[value="star"]').disabled = !p.star
    if (!p.star && focus === 'star') focus = 'tree'
    hardwareView.value = focus
    const m = calculate(p),
      h = p.height * inch,
      r = (p.base * inch) / 2,
      top = (p.top * inch) / 2
    const baseY = 0.08,
      length = assembly ? assembly.l.strip * 0.001 : m.length * inch
    const starSize = p.starWidth * inch
    modelHeight = baseY + h + (p.star ? starSize + 0.035 : 0)
    modelWidth = Math.max(2 * r, 2 * top, p.star ? starSize : 0)
    footprint.value = Math.max(r, 0.1)
    const spillColor = lightColor(pattern, 0.1, 0)
    positionPerson()
    const metal = material('#9ca6a4', 0.43, 0.65),
      steel = material('#547064', 0.66, 0.38)
    const plastic = material('#242a2c', 0.64)
    function add(geometry, mat, position) {
      const mesh = new T.Mesh(geometry, mat)
      if (position) mesh.position.copy(position)
      model.add(mesh)
      return mesh
    }
    function rod(a, b, radius, mat) {
      const dir = b.clone().sub(a)
      const mesh = add(
        new T.CylinderGeometry(radius, radius, dir.length(), 12),
        mat,
        a.clone().lerp(b, 0.5),
      )
      mesh.quaternion.setFromUnitVectors(up, dir.normalize())
    }
    if (assembly) {
      const current = model,
        layout = assembly
      modelHeight =
        layout.crownY * 0.001 +
        (p.star
          ? (layout.starY -
              layout.crownY +
              Math.max(...layout.l.star.vertices.map((v) => v[1])) +
              layout.l.star.rim) *
            0.001
          : 0.038)
      loadFrame(
        p,
        hardware,
        (meshes) => {
          if (model !== current) return
          addAssembly(model, p, layout, meshes)
          frameStatus.textContent = ''
          current.userData.printedFrame = true
          settleFrame(true)
          render()
        },
        (message) => {
          if (model !== current) return
          settleFrame(false)
          frameStatus.textContent =
              'Printed hardware unavailable · ' + message
        },
      )
    } else {
      rod(
        vec(0, 0.006, 0),
        vec(0, h + baseY + (p.star ? 0.07 : 0), 0),
        0.016,
        metal,
      )
      for (const x of [-1, 1]) {
        rod(
          vec(r * 0.8 * x, 0.014, -r * 0.65),
          vec(-r * 0.8 * x, 0.014, r * 0.65),
          0.012,
          steel,
        )
      }
      const sweep = (p.angle * Math.PI) / 180
      for (const [radius, y] of [
        [r, baseY],
        [top, h + baseY],
      ]) {
        if (!radius) continue
        const ring = add(
          new T.TorusGeometry(radius, 0.006, 8, 128, sweep),
          metal,
          vec(0, y, 0),
        )
        ring.rotation.order = 'YXZ'
        ring.rotation.x = Math.PI / 2
        // The start and end of the ring coincide with the outer strip anchors.
        ring.rotation.y = (sweep - Math.PI) / 2
        for (let n = 0; n < 3; n++) {
          const a = (n / 2 - 0.5) * Math.min(sweep, Math.PI * 1.33)
          rod(
            vec(0, y, 0),
            vec(Math.sin(a) * radius, y, Math.cos(a) * radius),
            0.004,
            steel,
          )
        }
      }
    }
    const stripWidth = p.stripWidth * inch,
      pitch = p.pitch * inch
    const tail = assembly ? (p.holePitch * inch) / 2 : p.tail * inch,
      first = assembly
        ? assembly.l.ends * p.holePitch * inch
        : (m.leftover * inch) / 2
    const holePitch = (m.onPitch ? p.holePitch : p.pitch) * inch
    const stripMat = material('#272d30', 0.61)
    stripMat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute vec3 stripRest; varying vec3 stripPos;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nstripPos=stripRest;',
        )
      shader.fragmentShader =
        'varying vec3 stripPos;\n' +
        shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
        float stepY = ${holePitch.toFixed(8)};
        float y = stripPos.y + ${(length / 2 - first).toFixed(8)};
        float nodeY = mod(y + stepY*0.5,stepY)-stepY*0.5;
        float tieY = mod(y,stepY)-0.5*stepY;
        float tieX = mod(stripPos.x + ${(stripWidth / 6).toFixed(8)}, ${(stripWidth / 3).toFixed(8)})-${(stripWidth / 6).toFixed(8)};
        if (length(vec2(stripPos.x,nodeY)) < ${(p.holeDiameter / 2000).toFixed(8)} || length(vec2(tieX,tieY)) < 0.00155) discard;`,
        )
    }
    const lap =
      assembly &&
      assembly.l.upperHoleR * 0.001 * assembly.l.smallestGap <
        stripWidth + 0.005
    const stripGeo = new T.BoxGeometry(
      stripWidth,
      length + 2 * tail,
      p.thickness * inch,
      lap ? 12 : 1,
      lap ? 48 : 1,
      1,
    )
    const positions = stripGeo.attributes.position
    stripGeo.setAttribute('stripRest', positions.clone())
    if (lap) {
      const { l } = assembly,
        sin = (l.base.wrapR - l.topR) / l.span,
        cos = l.rise / l.span
      // Bend flexible stock across its width and tuck the same edge on each run.
      // At the punched centreline x=0 the deformation is exactly zero.
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i)
        const r = l.upperHoleR * 0.001 + (length / 2 - y) * sin,
          gap = r * l.smallestGap
        const weight =
          1 - T.MathUtils.smoothstep(gap, stripWidth, stripWidth + 0.004)
        const lift = ((p.thickness * inch + 0.00045) * x) / (cos * gap)
        const theta = x / r,
          dr = ((r + lift) * Math.cos(theta) - r) * weight
        positions.setXYZ(
          i,
          x + weight * ((r + lift) * Math.sin(theta) - x),
          y - dr * sin,
          z + dr * cos,
        )
      }
      stripGeo.computeVertexNormals()
    }
    const skip = Math.max(1, Math.ceil(m.treePixels / 26000))
    const count =
      Math.ceil(m.perStrand / skip) * p.strands + (p.star ? p.starPixels : 0)
    const zCylinder = (r1, r2, depth) =>
      new T.CylinderGeometry(r1, r2, depth, inspection ? 28 : 12).rotateX(
        Math.PI / 2,
      )
    function instances(geo, mat, n = count) {
      const mesh = new T.InstancedMesh(geo, mat, n)
      model.add(mesh)
      return mesh
    }
    const polymer = new T.MeshPhysicalMaterial({
      color: inspection ? '#b8d0df' : '#7890a4',
      roughness: 0.24,
      metalness: 0,
      clearcoat: 0.7,
      transparent: inspection,
      opacity: inspection ? 0.51 : 1,
      depthWrite: !inspection,
    })
    const collars = instances(zCylinder(0.0068, 0.0077, 0.0055), polymer)
    const bodies = instances(zCylinder(0.0059, 0.0048, 0.023), polymer)
    const lensShape = new T.LatheGeometry(
      [
        [0.0054, 0],
        [0.0054, 0.003],
        [0.0049, 0.0058],
        [0.0034, 0.0078],
        [0, 0.009],
      ].map(([x, y]) => new T.Vector2(x, y)),
      inspection ? 32 : 12,
    ).rotateX(Math.PI / 2)
    const lamps = instances(
      lensShape,
      inspection
        ? new T.MeshPhysicalMaterial({
            color: '#e5eff7',
            roughness: 0.24,
            clearcoat: 1,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
          })
        : new T.MeshBasicMaterial({ color: 0xffffff }),
    )
    const boards = inspection
      ? instances(
          new T.BoxGeometry(0.0065, 0.002, 0.021),
          material('#205647', 0.63),
        )
      : null
    const chips = inspection
      ? instances(
          new T.BoxGeometry(0.0035, 0.0025, 0.004),
          material('#23282a', 0.46),
        )
      : null
    const wireParts = [-1, 0, 1].map((n) => {
      const x = n * 0.00175
      const path = new T.CatmullRomCurve3([
        vec(x, 0, -0.022),
        vec(x + 0.001, pitch * 0.22, -0.037),
        vec(x + 0.003, pitch * 0.65, -0.046),
        vec(x, pitch, -0.022),
      ])
      return new T.TubeGeometry(path, 8, 0.00094, 4, false)
    })
    const cableGeo = mergeGeometries(wireParts)
    wireParts.forEach((g) => g.dispose())
    const wires = instances(
      cableGeo,
      plastic,
      skip === 1 ? (m.perStrand - 1) * p.strands : 0,
    )
    let i = 0,
      wire = 0
    const matrix = new T.Matrix4(),
      scale = vec(1, 1, 1)
    const glowPositions = [],
      glowColors = []
    function lamp(pos, rotation, normal, color) {
      const at = (d) =>
        matrix.compose(pos.clone().addScaledVector(normal, d), rotation, scale)
      bodies.setMatrixAt(i, at(-0.011))
      collars.setMatrixAt(i, at(0.002))
      lamps.setMatrixAt(i, at(0.0043))
      if (inspection) {
        boards.setMatrixAt(i, at(-0.01))
        chips.setMatrixAt(i, at(-0.012))
      } else lamps.setColorAt(i, color)
      glowPositions.push(
        ...pos.clone().addScaledVector(normal, 0.012).toArray(),
      )
      glowColors.push(...color.toArray())
      i++
    }
    for (let s = 0; s < p.strands; s++) {
      const a = strandAngle(p, s)
      const radial = vec(Math.sin(a), 0, Math.cos(a))
      const from = radial
        .clone()
        .multiplyScalar(r)
        .add(vec(0, baseY, 0))
      const to = radial
        .clone()
        .multiplyScalar(top)
        .add(vec(0, h + baseY, 0))
      if (assembly) {
        from.copy(assembly.runs[s].end).multiplyScalar(0.001)
        to.copy(assembly.runs[s].lip).multiplyScalar(0.001)
      }
      const along = to.clone().sub(from).normalize(),
        tangent = vec(Math.cos(a), 0, -Math.sin(a))
      const normal = tangent.clone().cross(along).normalize()
      tangent.copy(along).cross(normal).normalize()
      const rot = new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(tangent, along, normal),
      )
      if (s === Math.floor(p.strands / 2)) {
        detailTarget = from.clone().lerp(to, 0.5)
        detailNormal = normal
          .clone()
          .multiplyScalar(0.58)
          .addScaledVector(tangent, 0.78)
          .addScaledVector(along, 0.12)
          .normalize()
      }
      const strip = add(stripGeo, stripMat, from.clone().lerp(to, 0.5))
      strip.quaternion.copy(rot)
      for (let j = 0; j < m.perStrand; j += skip) {
        const d = first + j * pitch,
          pos = from.clone().addScaledVector(along, d)
        lamp(pos, rot, normal, lightColor(pattern, d / length, a))
        if (skip === 1 && j < m.perStrand - 1)
          wires.setMatrixAt(wire++, matrix.compose(pos, rot, scale))
      }
    }
    if (assembly && p.star) {
      for (const [x, y] of assembly.l.star.lights)
        lamp(
          vec(x * 0.001, (assembly.starY + y) * 0.001, 0.034),
          new T.Quaternion(),
          vec(0, 0, 1),
          new T.Color('#ffce79'),
        )
    } else if (p.star) {
      const points = []
      const radius = starSize / (2 * Math.cos(Math.PI / 10))
      const cy = baseY + h + 0.025 + radius * Math.cos(Math.PI / 5)
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5,
          rr = radius * (k % 2 ? 0.44 : 1)
        points.push(vec(Math.sin(a) * rr, cy + Math.cos(a) * rr, 0))
      }
      modelHeight = cy + radius
      for (let k = 0; k < 10; k++)
        rod(points[k], points[(k + 1) % 10], 0.0045, steel)
      for (let j = 0; j < p.starPixels; j++) {
        const t = (j * 10) / p.starPixels,
          k = Math.floor(t)
        lamp(
          points[k].clone().lerp(points[(k + 1) % 10], t - k),
          new T.Quaternion(),
          vec(0, 0, 1),
          new T.Color('#ffce79'),
        )
      }
    }
    const glowGeo = new T.BufferGeometry()
    glowGeo.setAttribute(
      'position',
      new T.Float32BufferAttribute(glowPositions, 3),
    )
    glowGeo.setAttribute('color', new T.Float32BufferAttribute(glowColors, 3))
    const glow = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexColors: true,
      uniforms: {
        haloDiameter: { value: 0 },
        haloStrength: { value: 0 },
        scaleY: {
          value:
            (container.clientHeight * renderer.getPixelRatio()) /
            (2 * Math.tan(Math.PI / 10)),
        },
      },
      vertexShader: `
        varying vec3 tint;
        uniform float haloDiameter;
        uniform float scaleY;
        void main() {
          tint = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(haloDiameter * scaleY / -mv.z, 1., 96.);
        }`,
      fragmentShader: `
        varying vec3 tint;
        uniform float haloStrength;
        void main() {
          float d = length(gl_PointCoord - .5) * 2.;
          if (d > 1.) discard;
          float halo = .63 * exp(-4.4 * d) + .26 * exp(-16. * d * d);
          gl_FragColor = vec4(tint * 1.18, haloStrength * halo * (1. - smoothstep(.6, 1., d)));
        }`,
    })
    const halos = new T.Points(glowGeo, glow)
    halos.renderOrder = 2
    halos.visible = !inspection
    model.add(halos)
    applyLighting = () => {
      const closeUp = focus !== 'tree'
      ambient.intensity = inspection || closeUp ? 2 : 1.2
      key.intensity = inspection || closeUp ? 3 : 1.6
      const gain = inspection ? 0 : (brightness / 100) * (closeUp ? 0.23 : 1)
      if (!inspection)
        lamps.material.color.setScalar(gain * T.MathUtils.lerp(7, 8.5, spacing))
      bloom.strength = gain * T.MathUtils.lerp(0.43, 0.58, spacing)
      glow.uniforms.haloDiameter.value =
        T.MathUtils.lerp(0.021, 0.066, gain) * (1 + 0.35 * spacing)
      glow.uniforms.haloStrength.value = gain * (1 + 0.45 * spacing)
      fieldTint.value.copy(spillColor).multiplyScalar(gain)
    }
    applyLighting()
    if (focus !== 'tree' && !inspection) focusFrame()
    else if (fit) frame(fit === 'reset')
    else render()
    return skip
  }
  return {
    update,
    async capture() {
      await new Promise(requestAnimationFrame)
      await assetsReady
      let ready
      do {
        ready = frameReady
        if (!await ready && ready === frameReady) throw Error('The printed frame could not be rendered.')
      } while (ready !== frameReady)
      if (renderer.getContext().isContextLost()) throw Error('The 3D preview lost its WebGL context.')
      // WebGL can discard its drawing buffer after a frame is presented.
      render()
      async function png(canvas) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob) throw Error('The 3D view could not be captured.')
        return new Uint8Array(await blob.arrayBuffer())
      }
      const [screenshot, joints] = await Promise.all([png(renderer.domElement), png(jointViews(model))])
      return { screenshot, joints }
    },
    setBrightness(value) {
      brightness = value
      applyLighting?.()
      render()
    },
    showPerson(value) {
      personEnabled = value
      positionPerson()
      frame(false)
    },
    inspect: () => {
      inspection = !inspection
      update(latest, latestPattern, 'reset')
      return inspection
    },
    setFocus(value) {
      focus = value
      applyLighting?.()
      focusFrame()
    },
    fit: () => {
      focus = 'tree'
      applyLighting?.()
      document.getElementById('hardware-view').value = 'tree'
      frame()
    },
    grid: () => {
      grid.visible = !grid.visible
      render()
      return grid.visible
    },
  }
}
