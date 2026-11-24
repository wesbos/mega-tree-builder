import * as T from 'three'

// Photograph the same CAD meshes as the assembly, without the EMT hiding the
// socket blends. Their native CAD coordinate system is millimetres, Z up.
export function jointViews(model) {
  const above = [0.9, -1, 0.76],
    below = [0.6, -0.85, -1.65]
  const parts = [
    ['mast-base', 'Mast hub', above],
    ['spoke-corner', 'Spoke elbow', above],
    ['mast-base', 'Mast hub underside', below],
    ['spoke-corner', 'Spoke elbow underside', below],
    ['plain-corner', 'Rim elbow', above],
    ['star-socket', 'Star socket', [0.9, 1, -0.7]],
  ]
    .map(([name, label, view]) => [
      model.getObjectByName(name)?.geometry,
      label,
      view,
    ])
    .filter(([geometry]) => geometry)
  const width = 650,
    height = 430,
    margin = 28
  const page = document.createElement('canvas')
  page.width = width * 2
  page.height = Math.ceil(parts.length / 2) * height
  const ctx = page.getContext('2d')
  ctx.fillStyle = '#f2f2ed'
  ctx.fillRect(0, 0, page.width, page.height)
  const renderer = new T.WebGLRenderer({ antialias: true })
  const scene = new T.Scene()
  scene.background = new T.Color('#f2f2ed')
  const light = new T.DirectionalLight('#fff7e7', 2.3)
  light.position.set(-2, -3, 4)
  const rim = new T.DirectionalLight('#d2e7ff', 1.4)
  rim.position.set(1, 3, 2)
  scene.add(new T.HemisphereLight('#f9fcff', '#73706d', 1.6), light, rim)
  scene.up.set(0, 0, 1)
  const material = new T.MeshStandardMaterial({
    color: '#788b89',
    roughness: 0.42,
  })
  const imageHeight = height - 62
  renderer.setSize(width, imageHeight, false)
  try {
    parts.forEach(([geometry, label, view], i) => {
      const mesh = new T.Mesh(geometry, material)
      scene.add(mesh)
      geometry.computeBoundingSphere()
      const { center, radius } = geometry.boundingSphere
      const extent = radius * 1.04,
        aspect = width / imageHeight
      const camera = new T.OrthographicCamera(
        -extent * aspect,
        extent * aspect,
        extent,
        -extent,
        0.1,
        radius * 8
      )
      camera.up.copy(scene.up)
      const direction = new T.Vector3(...view)
      light.position.z = view === below ? -4 : 4
      camera.position
        .copy(center)
        .addScaledVector(direction.normalize(), radius * 4)
      camera.lookAt(center)
      renderer.render(scene, camera)
      const x = (i % 2) * width,
        y = Math.floor(i / 2) * height
      ctx.drawImage(renderer.domElement, x, y)
      ctx.font = '500 24px system-ui'
      ctx.fillStyle = '#263c37'
      ctx.fillText(label, x + margin, y + height - 26)
      scene.remove(mesh)
    })
  } finally {
    material.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  return page
}
