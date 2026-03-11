/**
 * 3D Scene manager using Three.js.
 * Handles rendering, camera, lights, and keypoint interaction.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class Scene3D {
  constructor(canvas, onKeypointDrag) {
    this.canvas = canvas
    this.onKeypointDrag = onKeypointDrag
    this.characters = []
    this.selectedMesh = null
    this.isDragging = false
    this.dragPlane = new THREE.Plane()
    this.dragOffset = new THREE.Vector3()
    this.mouseDownPos = new THREE.Vector2()

    this._init()
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

  _setupInteraction() {
    const el = this.renderer.domElement

    el.addEventListener('pointerdown', e => this._onPointerDown(e))
    el.addEventListener('pointermove', e => this._onPointerMove(e))
    el.addEventListener('pointerup', e => this._onPointerUp(e))
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

    const mouse = this._getMouseNDC(event)
    this.mouseDownPos.copy(mouse)
    this.raycaster.setFromCamera(mouse, this.camera)

    // Collect all keypoint meshes
    const allMeshes = this.characters.flatMap(c => c.getAllMeshes())
    const intersects = this.raycaster.intersectObjects(allMeshes, false)

    if (intersects.length > 0) {
      this.selectedMesh = intersects[0].object
      this.orbitControls.enabled = false
      this.isDragging = true

      // Set up drag plane perpendicular to camera
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion)
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, this.selectedMesh.position)

      event.stopPropagation()
    }
  }

  _onPointerMove(event) {
    if (!this.isDragging || !this.selectedMesh) return

    const mouse = this._getMouseNDC(event)
    this.raycaster.setFromCamera(mouse, this.camera)

    const target = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.dragPlane, target)) {
      this.selectedMesh.position.copy(target)

      // Notify about keypoint change
      if (this.onKeypointDrag) {
        this.onKeypointDrag(
          this.selectedMesh.userData.characterId,
          this.selectedMesh.userData.part,
          this.selectedMesh.userData.index,
          target.clone(),
        )
      }
    }
  }

  _onPointerUp() {
    this.isDragging = false
    this.selectedMesh = null
    this.orbitControls.enabled = true
  }

  addCharacter(character) {
    this.characters.push(character)
    this.scene.add(character.group)
  }

  removeCharacter(character) {
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
   * Width and height default to standard ControlNet resolution.
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
