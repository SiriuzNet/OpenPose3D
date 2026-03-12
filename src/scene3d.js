/**
 * 3D Scene manager using Three.js.
 * Handles rendering, camera, lights, and keypoint interaction via TransformControls.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

export class Scene3D {
  constructor(canvas, onKeypointDrag) {
    this.canvas = canvas
    this.onKeypointDrag = onKeypointDrag
    this.characters = []
    this.selectedBone = null
    this.selectedCharacter = null

    // Interaction mode: 'rotate' or 'translate'
    this._moveMode = false
    this._isClick = false

    // Callbacks for UI updates
    this.onModeChange = null
    this.onSelectionChange = null

    this._init()
    this._setupTransformControls()
    this._setupInteraction()
    this._animate()
  }

  _init() {
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 600

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.setClearColor(0x1a1a2e, 1)

    // Scene
    this.scene = new THREE.Scene()

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100)
    this.camera.position.set(0, 0, 3.5)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(2, 3, 2)
    this.scene.add(dirLight)

    const backLight = new THREE.DirectionalLight(0x4488ff, 0.3)
    backLight.position.set(-2, -1, -2)
    this.scene.add(backLight)

    // Grid helper
    this.gridHelper = new THREE.GridHelper(4, 20, 0x333355, 0x222244)
    this.gridHelper.position.y = -0.9
    this.scene.add(this.gridHelper)

    // Orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement)
    this.orbitControls.enableDamping = true
    this.orbitControls.dampingFactor = 0.05
    this.orbitControls.minDistance = 0.5
    this.orbitControls.maxDistance = 20

    // Raycaster
    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Mesh.threshold = 0.02

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this._onResize())
    this.resizeObserver.observe(this.canvas.parentElement)
  }

  _onResize() {
    const container = this.canvas.parentElement
    if (!container) return
    const w = container.clientWidth
    const h = container.clientHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  _setupTransformControls() {
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement)
    this.transformControls.setMode('rotate')
    this.transformControls.setSize(0.5)
    this.transformControls.setSpace('local')
    this.scene.add(this.transformControls)

    // Disable orbit while using gizmo
    this.transformControls.addEventListener('mouseDown', () => {
      this.orbitControls.enabled = false
    })
    this.transformControls.addEventListener('mouseUp', () => {
      this.orbitControls.enabled = true
      // Sync keypoint positions after transform
      this._syncAfterTransform()
    })
    this.transformControls.addEventListener('change', () => {
      // Live update during drag
      this._syncAfterTransform()
    })
  }

  _setupInteraction() {
    const el = this.renderer.domElement

    el.addEventListener('pointerdown', e => this._onPointerDown(e))
    el.addEventListener('pointermove', e => this._onPointerMove(e))
    el.addEventListener('pointerup', e => this._onPointerUp(e))

    // Keyboard: X for move mode
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.code === 'KeyX') this.setMoveMode(true)
    })
    document.addEventListener('keyup', e => {
      if (e.code === 'KeyX') this.setMoveMode(false)
    })
  }

  _getMouseNDC(event) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  _onPointerDown(event) {
    if (event.button !== 0) return
    this._isClick = true
  }

  _onPointerMove(event) {
    if (event.movementX !== 0 || event.movementY !== 0) {
      this._isClick = false
    }
  }

  _onPointerUp(event) {
    if (!this._isClick || event.button !== 0) return

    const mouse = this._getMouseNDC(event)
    this.raycaster.setFromCamera(mouse, this.camera)

    // Collect all bone meshes from characters
    const allMeshes = this.characters.flatMap(c => c.getAllBoneMeshes())
    const intersects = this.raycaster.intersectObjects(allMeshes, false)

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object
      const charId = hitMesh.userData.characterId
      const boneId = hitMesh.userData.boneId
      const char = this.characters.find(c => c.id === charId)
      if (!char) return

      const bone = char.getBoneById(boneId)
      if (!bone) return

      this.selectedBone = bone
      this.selectedCharacter = char

      if (this._moveMode) {
        // In move mode: attach to bone group root to translate whole character,
        // or to the bone itself if it's the root
        const isRoot = bone.parent === null
        if (isRoot) {
          this.transformControls.setMode('translate')
          this.transformControls.setSpace('world')
          this.transformControls.attach(char.boneGroup)
        } else {
          // Move mode on non-root: translate the whole character
          this.transformControls.setMode('translate')
          this.transformControls.setSpace('world')
          this.transformControls.attach(char.boneGroup)
        }
      } else {
        // Rotate mode
        this.transformControls.setMode('rotate')
        this.transformControls.setSpace('local')
        this.transformControls.attach(bone.object3d)
      }

      if (this.onSelectionChange) {
        this.onSelectionChange(char, bone)
      }
    } else {
      // Click on empty space — deselect
      this.transformControls.detach()
      this.selectedBone = null
      this.selectedCharacter = null
      if (this.onSelectionChange) {
        this.onSelectionChange(null, null)
      }
    }
  }

  setMoveMode(enabled) {
    this._moveMode = enabled

    if (this.selectedBone && this.selectedCharacter) {
      if (enabled) {
        this.transformControls.setMode('translate')
        this.transformControls.setSpace('world')
        this.transformControls.attach(this.selectedCharacter.boneGroup)
      } else {
        this.transformControls.setMode('rotate')
        this.transformControls.setSpace('local')
        this.transformControls.attach(this.selectedBone.object3d)
      }
    }

    if (this.onModeChange) {
      this.onModeChange(enabled ? 'translate' : 'rotate')
    }
  }

  get moveMode() {
    return this._moveMode
  }

  _syncAfterTransform() {
    // After any transform operation, sync all character keypoint positions from bones
    this.characters.forEach(char => {
      if (char.syncKeypointsFromBones) {
        char.syncKeypointsFromBones()
      }
    })

    // Notify about changes
    if (this.onKeypointDrag) {
      this.onKeypointDrag()
    }
  }

  addCharacter(character) {
    this.characters.push(character)
    this.scene.add(character.group)
  }

  removeCharacter(character) {
    // Detach if selected character is being removed
    if (this.selectedCharacter === character) {
      this.transformControls.detach()
      this.selectedBone = null
      this.selectedCharacter = null
    }
    const idx = this.characters.indexOf(character)
    if (idx >= 0) {
      this.characters.splice(idx, 1)
      this.scene.remove(character.group)
    }
  }

  setBackgroundColor(color) {
    this.renderer.setClearColor(new THREE.Color(color), 1)
  }

  setBackgroundImage(imageDataURL) {
    const loader = new THREE.TextureLoader()
    loader.load(imageDataURL, (texture) => {
      this.scene.background = texture
    })
  }

  clearBackground() {
    this.scene.background = null
  }

  showGrid(visible) {
    this.gridHelper.visible = visible
  }

  getCameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.orbitControls.target.toArray(),
      fov: this.camera.fov,
    }
  }

  setCameraState(state) {
    if (!state) return
    if (state.position) this.camera.position.fromArray(state.position)
    if (state.target) this.orbitControls.target.fromArray(state.target)
    if (state.fov) {
      this.camera.fov = state.fov
      this.camera.updateProjectionMatrix()
    }
  }

  _animate() {
    this._animFrameId = requestAnimationFrame(() => this._animate())
    this.orbitControls.update()
    this.renderer.render(this.scene, this.camera)
  }

  destroy() {
    cancelAnimationFrame(this._animFrameId)
    this.resizeObserver.disconnect()
    this.renderer.dispose()
  }

  /**
   * Render current view to a PNG data URL for ControlNet export.
   */
  renderToDataURL(width = 512, height = 768) {
    const offscreenRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    offscreenRenderer.setSize(width, height)
    offscreenRenderer.setClearColor(0x000000, 1)

    const aspect = width / height
    const offCamera = this.camera.clone()
    offCamera.aspect = aspect
    offCamera.updateProjectionMatrix()

    offscreenRenderer.render(this.scene, offCamera)
    const dataURL = offscreenRenderer.domElement.toDataURL('image/png')
    offscreenRenderer.dispose()
    return dataURL
  }
}
