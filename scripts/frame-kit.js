import { writeFile } from 'node:fs/promises'
import init from 'manifold-3d'
import { defaults } from '../src/model.js'
import { buildKit } from '../src/frame/kit.js'
const kernel = await init()
kernel.setup()
const kit = buildKit(kernel, defaults)
await writeFile(
  new URL('../public/downloads/mega-tree-frame.zip', import.meta.url),
  kit,
)
console.log('Wrote default frame kit, ' + kit.length + ' bytes')
