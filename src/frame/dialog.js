import { cutSheet } from './cut-sheet.js'
import { hardware, frameLayout, savedHardware } from './layout.js'

export function setupFrameDialog(tree, refreshPreview, capturePreview) {
  const $ = (id) => document.getElementById(id)
  const dialog = $('frame-dialog'),
    form = $('frame-options'),
    status = $('frame-status')
  let currentWorker
  function settings() {
    return Object.fromEntries(
      Object.keys(hardware).map((key) => [
        key,
        form.elements[key].valueAsNumber,
      ])
    )
  }
  const saved = savedHardware()
  for (const [key, fallback] of Object.entries(hardware))
    form.elements[key].value = saved?.[key] ?? fallback
  function download(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  $('frame-cut-sheet').onclick = () => {
    if (!form.reportValidity()) return
    try {
      const sheet = cutSheet(frameLayout(tree, settings()))
      download(
        new Blob([sheet.text], { type: 'text/plain;charset=utf-8' }),
        'CUT-SHEET.txt'
      )
    } catch (error) {
      status.textContent = error.message
    }
  }
  function update() {
    if (!form.checkValidity()) {
      status.textContent = 'Check the highlighted measurements.'
      return
    }
    try {
      const layout = frameLayout(tree, settings())
      const cut = cutSheet(layout)
      status.textContent =
        [cut.buy, ...cut.longer].join(' ') +
        ' ' +
        layout.base.edges.length +
        ' rim rails · ' +
        layout.base.edges.filter((e) => e.split).length +
        ' inline couplers · ' +
        ((2 * layout.topR) / 25.4).toFixed(2) +
        ' in slotted crown · ' +
        (layout.mast / 25.4).toFixed(2) +
        ' in mast cut · ' +
        2 * tree.strands +
        ' bungees (one at each end).'
    } catch (error) {
      status.textContent = error.message
    }
  }
  $('frame-open').onclick = () => {
    update()
    dialog.showModal()
  }
  $('frame-close').onclick = () => dialog.close()
  dialog.onclose = () => {
    currentWorker?.terminate()
    currentWorker = null
    form.querySelector('fieldset').disabled = false
    $('frame-generate').disabled = false
  }
  form.oninput = () => {
    update()
    if (form.checkValidity()) {
      try {
        localStorage.setItem(
          'tree-frame-direct-wrap',
          JSON.stringify(settings())
        )
      } catch {}
      refreshPreview()
    }
  }
  form.onsubmit = async (e) => {
    e.preventDefault()
    if (currentWorker) return
    const config = { ...tree },
      f = settings()
    try {
      frameLayout(config, f)
    } catch (error) {
      status.textContent = error.message
      return
    }
    try {
      localStorage.setItem('tree-frame-direct-wrap', JSON.stringify(f))
    } catch {}
    status.textContent =
      'Generating printable parts and checking the mesh and bed dimensions…'
    form.querySelector('fieldset').disabled = true
    $('frame-generate').disabled = true
    function finish(message) {
      currentWorker?.terminate()
      currentWorker = null
      form.querySelector('fieldset').disabled = false
      $('frame-generate').disabled = false
      status.textContent = message
    }
    currentWorker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    })
    currentWorker.onerror = (e) =>
      finish('Frame generation failed. ' + e.message)
    currentWorker.onmessage = ({ data }) => {
      if (data.error) {
        finish(data.error)
        return
      }
      download(new Blob([data.zip], { type: 'application/zip' }), data.filename)
      finish(
        'Kit downloaded. CUT-SHEET.txt lists what to buy and cut. ASSEMBLY.txt has print quantities and assembly steps.'
      )
    }
    const worker = currentWorker
    try {
      const { screenshot, joints } = await capturePreview()
      if (currentWorker === worker)
        worker.postMessage({ tree: config, hardware: f, screenshot, joints }, [
          screenshot.buffer,
          joints.buffer,
        ])
    } catch (error) {
      if (currentWorker === worker)
        finish('Kit export failed. ' + error.message)
    }
  }
}
