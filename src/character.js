/**
 * Character class - manages a single character with body, face, and hand skeletons.
 */
import * as THREE from 'three'
import {
  BODY25_KEYPOINTS,
  BODY25_CONNECTIONS,
  BODY25_CONNECTION_COLORS,
  COCO18_KEYPOINTS,
  COCO18_CONNECTIONS,
  getDefaultBodyPose,
} from './skeleton/body.js'
import { FACE_CONNECTIONS, FACE_COLOR, getDefaultFacePose } from './skeleton/face.js'
import { HAND_CONNECTIONS, HAND_CONNECTION_COLORS, getDefaultHandPose } from './skeleton/hands.js'

let characterCounter = 0

export class Character {
  constructor(options = {}) {
    this.id = ++characterCounter
    this.name = options.name || `Character ${this.id}`
    this.bodyFormat = options.bodyFormat || 'BODY_25'
    this.offset = options.offset || new THREE.Vector3(0, 0, 0)

    this.showBody = true
    this.showFace = true
    this.showHands = true

    this.keypoints = {
      body: [],
      face: [],
      rightHand: [],
      leftHand: [],
    }

    this.meshes = {
      body: [],
      face: [],
      rightHand: [],
      leftHand: [],
    }

    this.lines = {
      body: null,
      face: null,
      rightHand: null,
      leftHand: null,
    }

    this.group = new THREE.Group()
    this.group.userData.characterId = this.id

    this._initDefaultPose()
  }

  _initDefaultPose() {
    const bodyPts = getDefaultBodyPose(this.bodyFormat)
    this.keypoints.body = bodyPts.map(([x, y, z]) => new THREE.Vector3(x, y, z))

    // Determine head position for face (use nose + offset upward)
    const nosePos = this.keypoints.body[0]
    const headCenter = [nosePos.x, nosePos.y + 0.02, nosePos.z]

    const facePts = getDefaultFacePose(headCenter, 0.13)
    this.keypoints.face = facePts.map(([x, y, z]) => new THREE.Vector3(x, y, z))

    // Hand positions from body wrist keypoints
    const rwristIdx = this.bodyFormat === 'BODY_25' ? 4 : 4
    const lwristIdx = this.bodyFormat === 'BODY_25' ? 7 : 7
    const rwrist = this.keypoints.body[rwristIdx]
    const lwrist = this.keypoints.body[lwristIdx]

    const rHandPts = getDefaultHandPose([rwrist.x, rwrist.y, rwrist.z], 0.1, false)
    const lHandPts = getDefaultHandPose([lwrist.x, lwrist.y, lwrist.z], 0.1, true)

    this.keypoints.rightHand = rHandPts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    this.keypoints.leftHand = lHandPts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  }

  buildMeshes(settings) {
    // Remove old meshes
    this.group.clear()

    // Build body
    if (this.showBody) {
      this._buildKeypointSpheres('body', this.keypoints.body, settings.bodyColor, settings.markerSize)
      this._buildConnectionLines('body', this.keypoints.body,
        this.bodyFormat === 'BODY_25' ? BODY25_CONNECTIONS : COCO18_CONNECTIONS,
        this.bodyFormat === 'BODY_25' ? BODY25_CONNECTION_COLORS : null,
        settings.lineWidth)
    }

    // Build face
    if (this.showFace) {
      this._buildKeypointSpheres('face', this.keypoints.face, settings.faceColor, settings.faceMarkerSize)
      this._buildConnectionLines('face', this.keypoints.face, FACE_CONNECTIONS, FACE_COLOR, settings.lineWidth)
    }

    // Build hands
    if (this.showHands) {
      this._buildKeypointSpheres('rightHand', this.keypoints.rightHand, settings.handColor, settings.handMarkerSize)
      this._buildConnectionLines('rightHand', this.keypoints.rightHand, HAND_CONNECTIONS, HAND_CONNECTION_COLORS, settings.lineWidth)

      this._buildKeypointSpheres('leftHand', this.keypoints.leftHand, settings.handColor, settings.handMarkerSize)
      this._buildConnectionLines('leftHand', this.keypoints.leftHand, HAND_CONNECTIONS, HAND_CONNECTION_COLORS, settings.lineWidth)
    }

    this.group.position.copy(this.offset)
  }

  _buildKeypointSpheres(part, keypoints, color, size) {
    // Remove old spheres for this part
    this.meshes[part].forEach(m => this.group.remove(m))
    this.meshes[part] = []

    const geometry = new THREE.SphereGeometry(size, 8, 8)
    keypoints.forEach((kp, idx) => {
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color).multiplyScalar(0.3),
      })
      const sphere = new THREE.Mesh(geometry, material)
      sphere.position.copy(kp)
      sphere.userData = { part, index: idx, characterId: this.id }
      this.group.add(sphere)
      this.meshes[part].push(sphere)
    })
  }

  _buildConnectionLines(part, keypoints, connections, colors, lineWidth) {
    // Remove old line for this part
    if (this.lines[part]) {
      this.group.remove(this.lines[part])
      this.lines[part] = null
    }

    const lineGroup = new THREE.Group()

    connections.forEach(([from, to], idx) => {
      const fromPt = keypoints[from]
      const toPt = keypoints[to]
      if (!fromPt || !toPt) return

      const color = Array.isArray(colors) ? colors[idx] || '#ffffff' : (colors || '#ffffff')

      const points = [fromPt.clone(), toPt.clone()]
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
      })
      const line = new THREE.Line(geometry, material)
      line.userData = { part, connectionIndex: idx }
      lineGroup.add(line)
    })

    this.lines[part] = lineGroup
    this.group.add(lineGroup)
  }

  updateKeypointPosition(part, index, newPosition) {
    if (!this.keypoints[part] || !this.keypoints[part][index]) return
    this.keypoints[part][index].copy(newPosition)

    // Update sphere position
    const sphere = this.meshes[part][index]
    if (sphere) {
      sphere.position.copy(newPosition)
    }

    // Update connection lines
    this._updateLines(part)
  }

  _updateLines(part) {
    const linesGroup = this.lines[part]
    if (!linesGroup) return

    const keypoints = this.keypoints[part]
    const connections = this._getConnections(part)
    if (!connections) return

    linesGroup.children.forEach((line, idx) => {
      const [from, to] = connections[idx]
      const fromPt = keypoints[from]
      const toPt = keypoints[to]
      if (!fromPt || !toPt) return

      const positions = line.geometry.attributes.position
      positions.setXYZ(0, fromPt.x, fromPt.y, fromPt.z)
      positions.setXYZ(1, toPt.x, toPt.y, toPt.z)
      positions.needsUpdate = true
    })
  }

  _getConnections(part) {
    switch (part) {
      case 'body':
        return this.bodyFormat === 'BODY_25' ? BODY25_CONNECTIONS : COCO18_CONNECTIONS
      case 'face':
        return FACE_CONNECTIONS
      case 'rightHand':
      case 'leftHand':
        return HAND_CONNECTIONS
    }
    return null
  }

  getKeypointNames(part) {
    switch (part) {
      case 'body':
        return this.bodyFormat === 'BODY_25' ? BODY25_KEYPOINTS : COCO18_KEYPOINTS
      case 'face':
        return Array.from({ length: 68 }, (_, i) => `Face${i}`)
      case 'rightHand':
      case 'leftHand':
        return Array.from({ length: 21 }, (_, i) => `Hand${i}`)
    }
    return []
  }

  getAllMeshes() {
    return [
      ...this.meshes.body,
      ...this.meshes.face,
      ...this.meshes.rightHand,
      ...this.meshes.leftHand,
    ]
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      bodyFormat: this.bodyFormat,
      offset: this.offset.toArray(),
      showBody: this.showBody,
      showFace: this.showFace,
      showHands: this.showHands,
      keypoints: {
        body: this.keypoints.body.map(v => v.toArray()),
        face: this.keypoints.face.map(v => v.toArray()),
        rightHand: this.keypoints.rightHand.map(v => v.toArray()),
        leftHand: this.keypoints.leftHand.map(v => v.toArray()),
      },
    }
  }

  fromJSON(data) {
    this.name = data.name
    this.bodyFormat = data.bodyFormat
    this.offset.fromArray(data.offset)
    this.showBody = data.showBody
    this.showFace = data.showFace
    this.showHands = data.showHands
    this.keypoints.body = data.keypoints.body.map(a => new THREE.Vector3(...a))
    this.keypoints.face = data.keypoints.face.map(a => new THREE.Vector3(...a))
    this.keypoints.rightHand = data.keypoints.rightHand.map(a => new THREE.Vector3(...a))
    this.keypoints.leftHand = data.keypoints.leftHand.map(a => new THREE.Vector3(...a))
  }
}
