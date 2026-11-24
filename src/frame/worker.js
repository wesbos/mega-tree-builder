import init from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { kitFilename } from './kit-name.js'
import { buildKit } from './kit.js'
import { frameLayout } from './layout.js'
import { frameParts } from './solids.ts'

self.onmessage = async ({ data }) => {
  try {
    const kernel = await init({ locateFile: () => wasmUrl })
    kernel.setup()
    if (data.preview) {
      const layout = frameLayout(data.tree, data.hardware)
      const parts = frameParts(kernel, data.tree, data.hardware, layout)
      const meshes = {},
        transfers = []
      for (const { name, solid } of parts) {
        const m = solid.calculateNormals(0, 40).getMesh()
        const position = new Float32Array(m.numVert * 3),
          normal = new Float32Array(m.numVert * 3),
          index = new Uint32Array(m.triVerts)
        const props = m.vertProperties
        for (let i = 0; i < m.numVert; i++) {
          const offset = i * m.numProp
          for (let j = 0; j < 3; j++) {
            position[3 * i + j] = props[offset + j]
            normal[3 * i + j] = props[offset + j + 3]
          }
        }
        meshes[name] = { position, normal, index }
        transfers.push(position.buffer, normal.buffer, index.buffer)
      }
      self.postMessage({ meshes }, transfers)
      return
    }
    const zip = buildKit(
      kernel,
      data.tree,
      data.hardware,
      data.screenshot,
      data.joints
    )
    self.postMessage({ zip, filename: kitFilename(data.tree) }, [zip.buffer])
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
