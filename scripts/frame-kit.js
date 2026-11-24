import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { kitFilename } from '../src/frame/kit-name.js'
import { defaults } from '../src/model.js'

// Use the real export in an empty browser context so the sample camera, kit
// geometry, and cut sheet all correspond to the checked-in defaults.
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, open: false },
})
await server.listen()
let browser
try {
  browser = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || undefined,
    args: ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1080 },
    deviceScaleFactor: 1.5,
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'Print frame kit' }).click()
  const downloaded = page.waitForEvent('download', { timeout: 180000 })
  await page.getByRole('button', { name: 'Download this frame kit' }).click()
  const zip = await downloaded
  const name = kitFilename(defaults)
  if (zip.suggestedFilename() !== name)
    throw Error('Unexpected standard kit filename')
  const dest = new URL('../public/downloads/', import.meta.url)
  await mkdir(dest, { recursive: true })
  await zip.saveAs(new URL('mega-tree-frame.zip', dest).pathname)
  await writeFile(
    new URL('../public/_headers', import.meta.url),
    '/downloads/mega-tree-frame.zip\n  Content-Disposition: attachment; filename="' +
      name +
      '"\n'
  )
  console.log('Saved ' + name)
} finally {
  await browser?.close()
  await server.close()
}
