/**
 * OpenPose3D - Main Application
 * Manages UI, settings, character list, and coordinates between 3D scene and 2D renderer.
 */
import * as THREE from 'three'
import { Scene3D } from './scene3d.js'
import { Renderer2D } from './renderer2d.js'
import { Character } from './character.js'

// ─── Settings (default values) ────────────────────────────────────────────────
export const defaultSettings = {
  bodyFormat: 'BODY_25',      // 'BODY_25' or 'COCO_18'
  bodyColor: '#ff6644',
  faceColor: '#00ffff',
  handColor: '#ffff00',
  markerSize: 0.025,          // 3D sphere radius
  faceMarkerSize: 0.012,
  handMarkerSize: 0.015,
  lineWidth: 2,               // 3D line width
  lineWidth2D: 3,             // 2D canvas line width
  outputWidth: 512,
  outputHeight: 768,
  backgroundColor: '#000000',
  showGrid: true,
}

class App {
  constructor() {
    this.settings = { ...defaultSettings }
    this.characters = []
    this.selectedCharacterId = null
    // Detect if running inside ComfyUI iframe
    this.comfyUIMode = new URLSearchParams(window.location.search).get('comfyui') === 'true'

    this._buildUI()
    this._initScene()
    this._initRenderer2D()
    this._bindUIEvents()

    // Start with one default character
    this.addCharacter()
    this._render2D()

    // ComfyUI mode: listen for pose load from parent and announce ready
    if (this.comfyUIMode) {
      this._initComfyUIBridge()
    }
  }

  // ─── UI Construction ──────────────────────────────────────────────────────────

  _buildUI() {
    const comfyBtn = this.comfyUIMode
      ? `<button id="btn-send-comfyui" title="Send pose to ComfyUI node" style="background:#1a3a2a;color:#44ff88;border-color:#225533;">✓ Send to ComfyUI</button>`
      : ''
    document.getElementById('app').innerHTML = `
      <div class="app-layout${this.comfyUIMode ? ' comfyui-mode' : ''}">
        <!-- Toolbar -->
        <header class="toolbar">
          <div class="toolbar-left">
            <span class="app-title">OpenPose3D${this.comfyUIMode ? ' ✦ ComfyUI' : ' Editor'}</span>
          </div>
          <div class="toolbar-center">
            <button id="btn-add-char" title="Add character">＋ Add Character</button>
            <button id="btn-remove-char" title="Remove selected character">✕ Remove</button>
            <button id="btn-reset-pose" title="Reset pose to default">↺ Reset Pose</button>
            ${comfyBtn}
            <button id="btn-export-png" title="Export 2D PNG for ControlNet">⬇ Export PNG</button>
            <button id="btn-save-json" title="Save scene as JSON">💾 Save JSON</button>
            <button id="btn-load-json" title="Load scene from JSON">📂 Load JSON</button>
            <input type="file" id="file-input-json" accept=".json" style="display:none">
            <input type="file" id="file-input-bg" accept="image/*" style="display:none">
            <button id="btn-load-bg" title="Load background image">🖼 Background</button>
            <button id="btn-clear-bg" title="Clear background">✕ Clear BG</button>
          </div>
          <div class="toolbar-right">
            <label>Output:
              <input id="out-width" type="number" value="512" min="64" max="2048" step="64">
              ×
              <input id="out-height" type="number" value="768" min="64" max="2048" step="64">
            </label>
          </div>
        </header>

        <!-- Main area -->
        <div class="main-area">
          <!-- Left: 3D viewport -->
          <div class="viewport-container" id="viewport-container">
            <canvas id="canvas3d"></canvas>
            <div class="viewport-hint">Drag keypoints · Orbit: left-drag · Pan: right-drag · Zoom: scroll</div>
          </div>

          <!-- Right: Settings + preview -->
          <div class="sidebar">
            <!-- Characters list -->
            <section class="panel">
              <h3>Characters</h3>
              <ul id="char-list" class="char-list"></ul>
            </section>

            <!-- Settings -->
            <section class="panel">
              <h3>Settings</h3>

              <label class="setting-row">
                <span>Body Format</span>
                <select id="body-format">
                  <option value="BODY_25">BODY_25 (25 pts)</option>
                  <option value="COCO_18">COCO-18 (18 pts)</option>
                </select>
              </label>

              <label class="setting-row">
                <span>Marker Size</span>
                <input type="range" id="marker-size" min="0.005" max="0.08" step="0.001" value="0.025">
                <span id="marker-size-val">0.025</span>
              </label>

              <label class="setting-row">
                <span>Face Marker Size</span>
                <input type="range" id="face-marker-size" min="0.003" max="0.05" step="0.001" value="0.012">
                <span id="face-marker-size-val">0.012</span>
              </label>

              <label class="setting-row">
                <span>Hand Marker Size</span>
                <input type="range" id="hand-marker-size" min="0.003" max="0.05" step="0.001" value="0.015">
                <span id="hand-marker-size-val">0.015</span>
              </label>

              <label class="setting-row">
                <span>Line Width (2D)</span>
                <input type="range" id="line-width-2d" min="1" max="10" step="0.5" value="3">
                <span id="line-width-2d-val">3</span>
              </label>

              <label class="setting-row">
                <span>Body Color</span>
                <input type="color" id="body-color" value="#ff6644">
              </label>

              <label class="setting-row">
                <span>Face Color</span>
                <input type="color" id="face-color" value="#00ffff">
              </label>

              <label class="setting-row">
                <span>Hand Color</span>
                <input type="color" id="hand-color" value="#ffff00">
              </label>

              <label class="setting-row">
                <span>Background Color</span>
                <input type="color" id="bg-color" value="#000000">
              </label>

              <label class="setting-row checkbox-row">
                <input type="checkbox" id="show-grid" checked>
                <span>Show Grid</span>
              </label>
            </section>

            <!-- Visibility toggles per character -->
            <section class="panel" id="char-visibility-panel" style="display:none">
              <h3>Parts Visibility</h3>
              <label class="setting-row checkbox-row">
                <input type="checkbox" id="vis-body" checked>
                <span>Body</span>
              </label>
              <label class="setting-row checkbox-row">
                <input type="checkbox" id="vis-face" checked>
                <span>Face</span>
              </label>
              <label class="setting-row checkbox-row">
                <input type="checkbox" id="vis-hands" checked>
                <span>Hands</span>
              </label>
            </section>

            <!-- 2D preview -->
            <section class="panel">
              <h3>2D Preview (ControlNet)</h3>
              <div class="preview-wrapper">
                <canvas id="canvas2d" width="256" height="384"></canvas>
              </div>
            </section>
          </div>
        </div>
      </div>
    `
  }

  // ─── Scene Initialization ─────────────────────────────────────────────────────

  _initScene() {
    const canvas3d = document.getElementById('canvas3d')
    this.scene3d = new Scene3D(canvas3d, (charId, part, index, pos) => {
      this._onKeypointDrag(charId, part, index, pos)
    })
  }

  _initRenderer2D() {
    const canvas2d = document.getElementById('canvas2d')
    this.renderer2d = new Renderer2D(canvas2d)
  }

  // ─── Event Binding ────────────────────────────────────────────────────────────

  _bindUIEvents() {
    // Toolbar
    document.getElementById('btn-add-char').addEventListener('click', () => this.addCharacter())
    document.getElementById('btn-remove-char').addEventListener('click', () => this.removeSelectedCharacter())
    document.getElementById('btn-reset-pose').addEventListener('click', () => this.resetSelectedPose())
    document.getElementById('btn-export-png').addEventListener('click', () => this.exportPNG())
    document.getElementById('btn-save-json').addEventListener('click', () => this.saveJSON())
    document.getElementById('btn-load-json').addEventListener('click', () => document.getElementById('file-input-json').click())
    document.getElementById('file-input-json').addEventListener('change', e => this.loadJSON(e))
    document.getElementById('btn-load-bg').addEventListener('click', () => document.getElementById('file-input-bg').click())
    document.getElementById('file-input-bg').addEventListener('change', e => this.loadBackground(e))
    document.getElementById('btn-clear-bg').addEventListener('click', () => this.clearBackground())

    // ComfyUI send button (only present when ?comfyui=true)
    const sendBtn = document.getElementById('btn-send-comfyui')
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this._sendToComfyUI())
    }

    // Output size
    document.getElementById('out-width').addEventListener('change', e => {
      this.settings.outputWidth = parseInt(e.target.value)
    })
    document.getElementById('out-height').addEventListener('change', e => {
      this.settings.outputHeight = parseInt(e.target.value)
    })

    // Body format
    document.getElementById('body-format').addEventListener('change', e => {
      this.settings.bodyFormat = e.target.value
      this._rebuildAllCharacters()
    })

    // Marker sizes
    this._bindRangeInput('marker-size', 'marker-size-val', v => {
      this.settings.markerSize = parseFloat(v)
      this._rebuildAllCharacters()
    })
    this._bindRangeInput('face-marker-size', 'face-marker-size-val', v => {
      this.settings.faceMarkerSize = parseFloat(v)
      this._rebuildAllCharacters()
    })
    this._bindRangeInput('hand-marker-size', 'hand-marker-size-val', v => {
      this.settings.handMarkerSize = parseFloat(v)
      this._rebuildAllCharacters()
    })
    this._bindRangeInput('line-width-2d', 'line-width-2d-val', v => {
      this.settings.lineWidth2D = parseFloat(v)
      this._render2D()
    })

    // Colors
    document.getElementById('body-color').addEventListener('input', e => {
      this.settings.bodyColor = e.target.value
      this._rebuildAllCharacters()
    })
    document.getElementById('face-color').addEventListener('input', e => {
      this.settings.faceColor = e.target.value
      this._rebuildAllCharacters()
    })
    document.getElementById('hand-color').addEventListener('input', e => {
      this.settings.handColor = e.target.value
      this._rebuildAllCharacters()
    })

    // Background color
    document.getElementById('bg-color').addEventListener('input', e => {
      this.settings.backgroundColor = e.target.value
      this.scene3d.setBackgroundColor(e.target.value)
      this.renderer2d.setBackgroundColor(e.target.value)
      this._render2D()
    })

    // Grid
    document.getElementById('show-grid').addEventListener('change', e => {
      this.settings.showGrid = e.target.checked
      this.scene3d.showGrid(e.target.checked)
    })

    // Character visibility
    document.getElementById('vis-body').addEventListener('change', e => {
      const char = this._getSelectedCharacter()
      if (!char) return
      char.showBody = e.target.checked
      this._rebuildCharacter(char)
    })
    document.getElementById('vis-face').addEventListener('change', e => {
      const char = this._getSelectedCharacter()
      if (!char) return
      char.showFace = e.target.checked
      this._rebuildCharacter(char)
    })
    document.getElementById('vis-hands').addEventListener('change', e => {
      const char = this._getSelectedCharacter()
      if (!char) return
      char.showHands = e.target.checked
      this._rebuildCharacter(char)
    })

    // Continuously update 2D preview
    setInterval(() => this._render2D(), 100)

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { this.resetSelectedPose(); e.preventDefault() }
        if (e.key === 's') { this.saveJSON(); e.preventDefault() }
        if (e.key === 'e') { this.exportPNG(); e.preventDefault() }
        if (e.key === 'n') { this.addCharacter(); e.preventDefault() }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!e.target.closest('.sidebar')) this.removeSelectedCharacter()
      }
    })
  }

  _bindRangeInput(inputId, valueId, callback) {
    const input = document.getElementById(inputId)
    const valueEl = document.getElementById(valueId)
    input.addEventListener('input', e => {
      const v = e.target.value
      if (valueEl) valueEl.textContent = v
      callback(v)
    })
  }

  // ─── Character Management ──────────────────────────────────────────────────────

  addCharacter() {
    const char = new Character({
      bodyFormat: this.settings.bodyFormat,
      offset: new THREE.Vector3(this.characters.length * 0.5, 0, 0),
    })
    char.buildMeshes(this.settings)
    this.characters.push(char)
    this.scene3d.addCharacter(char)
    this.selectCharacter(char.id)
    this._updateCharList()
    this._render2D()
  }

  removeSelectedCharacter() {
    const char = this._getSelectedCharacter()
    if (!char) return
    this.scene3d.removeCharacter(char)
    this.characters = this.characters.filter(c => c.id !== char.id)
    this.selectedCharacterId = this.characters.length > 0 ? this.characters[0].id : null
    this._updateCharList()
    this._render2D()
  }

  resetSelectedPose() {
    const char = this._getSelectedCharacter()
    if (!char) return
    char._initDefaultPose()
    char.buildMeshes(this.settings)
    this._render2D()
  }

  selectCharacter(id) {
    this.selectedCharacterId = id
    this._updateCharList()
    this._updateVisibilityPanel()
  }

  _getSelectedCharacter() {
    return this.characters.find(c => c.id === this.selectedCharacterId) || null
  }

  _rebuildCharacter(char) {
    char.buildMeshes(this.settings)
    this._render2D()
  }

  _rebuildAllCharacters() {
    this.characters.forEach(c => c.buildMeshes(this.settings))
    this._render2D()
  }

  // ─── Keypoint Drag Handler ────────────────────────────────────────────────────

  _onKeypointDrag(charId, part, index, pos) {
    const char = this.characters.find(c => c.id === charId)
    if (!char) return
    char.updateKeypointPosition(part, index, pos)
    this._render2D()
  }

  // ─── 2D Rendering ─────────────────────────────────────────────────────────────

  _render2D() {
    const w = this.settings.outputWidth
    const h = this.settings.outputHeight
    const previewW = 256
    const previewH = Math.round(256 * h / w)

    const canvas2d = document.getElementById('canvas2d')
    if (canvas2d.width !== previewW || canvas2d.height !== previewH) {
      canvas2d.width = previewW
      canvas2d.height = previewH
    }
    this.renderer2d.resize(previewW, previewH)
    this.renderer2d.render(this.characters, this.scene3d.camera, this.settings)
  }

  // ─── Background ──────────────────────────────────────────────────────────────

  loadBackground(event) {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataURL = e.target.result
      this.scene3d.setBackgroundImage(dataURL)
      const img = new Image()
      img.onload = () => {
        this.renderer2d.setBackgroundImage(img)
        this._render2D()
      }
      img.src = dataURL
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  clearBackground() {
    this.scene3d.clearBackground()
    this.renderer2d.setBackgroundImage(null)
    this._render2D()
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  exportPNG() {
    const w = this.settings.outputWidth
    const h = this.settings.outputHeight

    // Render to a full-size offscreen 2D canvas
    const offCanvas = document.createElement('canvas')
    offCanvas.width = w
    offCanvas.height = h
    const offRenderer = new Renderer2D(offCanvas)
    offRenderer.setBackgroundColor(this.settings.backgroundColor)
    offRenderer.render(this.characters, this.scene3d.camera, this.settings)

    const link = document.createElement('a')
    link.download = `openpose3d_${w}x${h}.png`
    link.href = offCanvas.toDataURL('image/png')
    link.click()
  }

  // ─── Save / Load ──────────────────────────────────────────────────────────────

  saveJSON() {
    const data = {
      settings: this.settings,
      characters: this.characters.map(c => c.toJSON()),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.download = 'openpose3d_scene.json'
    link.href = URL.createObjectURL(blob)
    link.click()
  }

  loadJSON(event) {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)

        // Remove all current characters
        this.characters.forEach(c => this.scene3d.removeCharacter(c))
        this.characters = []

        // Apply settings
        Object.assign(this.settings, data.settings)
        this._applySettingsToUI()

        // Load characters
        data.characters.forEach(cData => {
          const char = new Character()
          char.fromJSON(cData)
          char.buildMeshes(this.settings)
          this.characters.push(char)
          this.scene3d.addCharacter(char)
        })

        this.selectedCharacterId = this.characters.length > 0 ? this.characters[0].id : null
        this._updateCharList()
        this._render2D()
      } catch (err) {
        alert('Error loading JSON: ' + err.message)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  _applySettingsToUI() {
    document.getElementById('body-format').value = this.settings.bodyFormat
    document.getElementById('marker-size').value = this.settings.markerSize
    document.getElementById('marker-size-val').textContent = this.settings.markerSize
    document.getElementById('face-marker-size').value = this.settings.faceMarkerSize
    document.getElementById('face-marker-size-val').textContent = this.settings.faceMarkerSize
    document.getElementById('hand-marker-size').value = this.settings.handMarkerSize
    document.getElementById('hand-marker-size-val').textContent = this.settings.handMarkerSize
    document.getElementById('line-width-2d').value = this.settings.lineWidth2D
    document.getElementById('line-width-2d-val').textContent = this.settings.lineWidth2D
    document.getElementById('body-color').value = this.settings.bodyColor
    document.getElementById('face-color').value = this.settings.faceColor
    document.getElementById('hand-color').value = this.settings.handColor
    document.getElementById('bg-color').value = this.settings.backgroundColor
    document.getElementById('show-grid').checked = this.settings.showGrid
    document.getElementById('out-width').value = this.settings.outputWidth
    document.getElementById('out-height').value = this.settings.outputHeight
  }

  // ─── UI Updates ───────────────────────────────────────────────────────────────

  _updateCharList() {
    const list = document.getElementById('char-list')
    list.innerHTML = ''
    this.characters.forEach(char => {
      const li = document.createElement('li')
      li.className = 'char-item' + (char.id === this.selectedCharacterId ? ' selected' : '')

      const nameSpan = document.createElement('span')
      nameSpan.className = 'char-name'
      nameSpan.textContent = char.name
      nameSpan.addEventListener('click', () => this.selectCharacter(char.id))

      // Editable name on double-click
      nameSpan.addEventListener('dblclick', () => {
        const input = document.createElement('input')
        input.value = char.name
        input.className = 'char-name-edit'
        li.replaceChild(input, nameSpan)
        input.focus()
        input.addEventListener('blur', () => {
          char.name = input.value
          li.replaceChild(nameSpan, input)
          nameSpan.textContent = char.name
        })
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur() })
      })

      li.appendChild(nameSpan)
      list.appendChild(li)
    })
    this._updateVisibilityPanel()
  }

  _updateVisibilityPanel() {
    const panel = document.getElementById('char-visibility-panel')
    const char = this._getSelectedCharacter()
    if (!char) {
      panel.style.display = 'none'
      return
    }
    panel.style.display = ''
    document.getElementById('vis-body').checked = char.showBody
    document.getElementById('vis-face').checked = char.showFace
    document.getElementById('vis-hands').checked = char.showHands
  }

  // ─── ComfyUI Bridge ───────────────────────────────────────────────────────────

  _initComfyUIBridge() {
    // Listen for incoming messages from the ComfyUI parent widget
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'openpose3d:load') return
      const scene = event.data.scene
      if (!scene) return
      try {
        // Remove existing characters
        this.characters.forEach(c => this.scene3d.removeCharacter(c))
        this.characters = []

        // Apply settings if present
        if (scene.settings) {
          Object.assign(this.settings, scene.settings)
          this._applySettingsToUI()
        }

        // Load characters
        if (Array.isArray(scene.characters)) {
          scene.characters.forEach(cData => {
            const char = new Character()
            char.fromJSON(cData)
            char.buildMeshes(this.settings)
            this.characters.push(char)
            this.scene3d.addCharacter(char)
          })
        }

        this.selectedCharacterId = this.characters.length > 0 ? this.characters[0].id : null
        this._updateCharList()
        this._render2D()
      } catch (err) {
        console.error('OpenPose3D: error loading scene from ComfyUI', err)
      }
    })

    // Notify the parent that the editor is ready
    window.parent.postMessage({ type: 'openpose3d:ready' }, '*')
  }

  _sendToComfyUI() {
    const sceneData = {
      settings: this.settings,
      characters: this.characters.map(c => c.toJSON()),
    }

    // Render a preview PNG at a reasonable size
    const previewW = 256
    const previewH = Math.round(256 * this.settings.outputHeight / this.settings.outputWidth)
    const offCanvas = document.createElement('canvas')
    offCanvas.width = previewW
    offCanvas.height = previewH
    const offRenderer = new Renderer2D(offCanvas)
    offRenderer.setBackgroundColor(this.settings.backgroundColor)
    offRenderer.render(this.characters, this.scene3d.camera, this.settings)
    const previewDataURL = offCanvas.toDataURL('image/png')

    window.parent.postMessage({
      type: 'openpose3d:apply',
      scene: sceneData,
      preview: previewDataURL,
    }, '*')
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App()
})
