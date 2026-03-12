/**
 * Character class - manages a single character with hierarchical bone structure.
 * Bones form a parent-child tree so rotating a parent joint propagates to children.
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
let boneIdCounter = 0

/**
 * A single bone in the skeleton hierarchy.
 * Each bone has a THREE.Object3D that holds a visual sphere mesh as child.
 * Children bones are added as children of the parent Object3D, creating
 * a transform hierarchy where rotating a parent propagates to children.
 */
class Bone {
  constructor(name, position, color, size) {
    this.id = ++boneIdCounter
    this.name = name
    this.parent = null
    this.children = []

    // The Object3D is the transform node in the hierarchy
    this.object3d = new THREE.Object3D()
    this.object3d.name = `bone_${name}`
    this.object3d.position.copy(position)

    // Visual sphere
    const geometry = new THREE.SphereGeometry(size, 8, 8)
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color).multiplyScalar(0.3),
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.userData = { boneId: this.id }
    // Mesh stays at local origin of the bone
    this.object3d.add(this.mesh)
  }

  addChild(childBone) {
    // Convert child's world position to local position relative to this bone
    const worldPos = childBone.object3d.position.clone()
    const parentWorldPos = this.getWorldPosition()
    childBone.object3d.position.copy(worldPos.sub(parentWorldPos))

    childBone.parent = this
    this.children.push(childBone)
    this.object3d.add(childBone.object3d)
  }

  getWorldPosition() {
    const pos = new THREE.Vector3()
    this.object3d.getWorldPosition(pos)
    return pos
  }
}

/**
 * Defines parent-child relationships for BODY_25 skeleton.
 * Maps each keypoint index to its parent index. Root (Neck=1) has parent -1.
 */
const BODY25_BONE_PARENTS = {
  1: -1,   // Neck is root
  0: 1,    // Nose -> Neck
  2: 1,    // RShoulder -> Neck
  3: 2,    // RElbow -> RShoulder
  4: 3,    // RWrist -> RElbow
  5: 1,    // LShoulder -> Neck
  6: 5,    // LElbow -> LShoulder
  7: 6,    // LWrist -> LElbow
  8: 1,    // MidHip -> Neck
  9: 8,    // RHip -> MidHip
  10: 9,   // RKnee -> RHip
  11: 10,  // RAnkle -> RKnee
  12: 8,   // LHip -> MidHip
  13: 12,  // LKnee -> LHip
  14: 13,  // LAnkle -> LKnee
  15: 0,   // REye -> Nose
  16: 0,   // LEye -> Nose
  17: 15,  // REar -> REye
  18: 16,  // LEar -> LEye
  19: 14,  // LBigToe -> LAnkle
  20: 19,  // LSmallToe -> LBigToe
  21: 14,  // LHeel -> LAnkle
  22: 11,  // RBigToe -> RAnkle
  23: 22,  // RSmallToe -> RBigToe
  24: 11,  // RHeel -> RAnkle
}

/**
 * Parent mapping for COCO-18 skeleton.
 */
const COCO18_BONE_PARENTS = {
  1: -1,   // Neck is root
  0: 1,    // Nose -> Neck
  2: 1,    // RShoulder -> Neck
  3: 2,    // RElbow -> RShoulder
  4: 3,    // RWrist -> RElbow
  5: 1,    // LShoulder -> Neck
  6: 5,    // LElbow -> LShoulder
  7: 6,    // LWrist -> LElbow
  8: 1,    // RHip -> Neck (no MidHip in COCO-18)
  9: 8,    // RKnee -> RHip
  10: 9,   // RAnkle -> RKnee
  11: 1,   // LHip -> Neck
  12: 11,  // LKnee -> LHip
  13: 12,  // LAnkle -> LKnee
  14: 0,   // REye -> Nose
  15: 0,   // LEye -> Nose
  16: 14,  // REar -> REye
  17: 15,  // LEar -> LEye
}

export class Character {
  constructor(options = {}) {
    this.id = ++characterCounter
    this.name = options.name || `Character ${this.id}`
    this.bodyFormat = options.bodyFormat || 'BODY_25'
    this.offset = options.offset || new THREE.Vector3(0, 0, 0)

    this.showBody = true
    this.showFace = true
    this.showHands = true

    // Per-character scale factors
    this.charScale = options.charScale || 1.0
    this.handScale = options.handScale || 1.0
    this.faceScale = options.faceScale || 1.0
    this.feetScale = options.feetScale || 1.0

    // Flat keypoint arrays (for serialization and 2D rendering)
    this.keypoints = {
      body: [],
      face: [],
      rightHand: [],
      leftHand: [],
    }

    // Bone hierarchy (body only — face/hands stay as flat keypoints)
    this.bones = []       // flat list of all body Bone objects, indexed by keypoint index
    this.rootBone = null   // the root bone (Neck)
    this.boneGroup = new THREE.Group()  // group holding the bone hierarchy
    this.boneGroup.userData.characterId = this.id

    // Non-bone meshes (face, hands)
    this.meshes = {
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

    const nosePos = this.keypoints.body[0]
    const headCenter = [nosePos.x, nosePos.y + 0.02, nosePos.z]

    const facePts = getDefaultFacePose(headCenter, 0.11)
    this.keypoints.face = facePts.map(([x, y, z]) => new THREE.Vector3(x, y, z))

    const rwristIdx = this.bodyFormat === 'BODY_25' ? 4 : 4
    const lwristIdx = this.bodyFormat === 'BODY_25' ? 7 : 7
    const rwrist = this.keypoints.body[rwristIdx]
    const lwrist = this.keypoints.body[lwristIdx]

    const rHandPts = getDefaultHandPose([rwrist.x, rwrist.y, rwrist.z], 0.12, false)
    const lHandPts = getDefaultHandPose([lwrist.x, lwrist.y, lwrist.z], 0.12, true)

    this.keypoints.rightHand = rHandPts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    this.keypoints.leftHand = lHandPts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  }

  buildMeshes(settings) {
    // Clear everything
    this.group.clear()
    this.boneGroup = new THREE.Group()
    this.boneGroup.userData.characterId = this.id

    // Apply overall character scale
    this.group.scale.setScalar(this.charScale)

    // Build body as bone hierarchy
    if (this.showBody) {
      this._buildBoneHierarchy(settings.bodyColor, settings.markerSize)
      this._buildConnectionLines('body', this.keypoints.body,
        this.bodyFormat === 'BODY_25' ? BODY25_CONNECTIONS : COCO18_CONNECTIONS,
        this.bodyFormat === 'BODY_25' ? BODY25_CONNECTION_COLORS : null,
        settings.lineWidth)
    }

    this.group.add(this.boneGroup)
    // Update world matrices so anchor bone positions are correct for attached spheres
    this.group.updateMatrixWorld(true)

    // Apply feet scale for BODY_25 by inserting scale containers under ankle bones
    if (this.showBody && this.bodyFormat === 'BODY_25') {
      this._applyFeetScale()
    }

    // Build face attached to Nose bone (index 0)
    if (this.showFace) {
      this._buildAttachedKeypointSpheres('face', this.keypoints.face, settings.faceColor, settings.faceMarkerSize, 0, this.faceScale)
      this._buildConnectionLines('face', this.keypoints.face, FACE_CONNECTIONS, FACE_COLOR, settings.lineWidth)
    }

    // Build hands attached to wrist bones
    if (this.showHands) {
      const rwristIdx = this.bodyFormat === 'BODY_25' ? 4 : 4
      const lwristIdx = this.bodyFormat === 'BODY_25' ? 7 : 7

      this._buildAttachedKeypointSpheres('rightHand', this.keypoints.rightHand, settings.handColor, settings.handMarkerSize, rwristIdx, this.handScale)
      this._buildConnectionLines('rightHand', this.keypoints.rightHand, HAND_CONNECTIONS, HAND_CONNECTION_COLORS, settings.lineWidth)

      this._buildAttachedKeypointSpheres('leftHand', this.keypoints.leftHand, settings.handColor, settings.handMarkerSize, lwristIdx, this.handScale)
      this._buildConnectionLines('leftHand', this.keypoints.leftHand, HAND_CONNECTIONS, HAND_CONNECTION_COLORS, settings.lineWidth)
    }

    this.group.position.copy(this.offset)
    // Ensure world matrices are current (including scale group transforms)
    this.group.updateMatrixWorld(true)
  }

  _buildBoneHierarchy(color, size) {
    const parentMap = this.bodyFormat === 'BODY_25' ? BODY25_BONE_PARENTS : COCO18_BONE_PARENTS
    const keypointNames = this.bodyFormat === 'BODY_25' ? BODY25_KEYPOINTS : COCO18_KEYPOINTS

    // Create all bone objects
    this.bones = []
    this.keypoints.body.forEach((pos, idx) => {
      const bone = new Bone(keypointNames[idx] || `body_${idx}`, pos.clone(), color, size)
      bone.mesh.userData.characterId = this.id
      bone.mesh.userData.part = 'body'
      bone.mesh.userData.index = idx
      this.bones[idx] = bone
    })

    // Build hierarchy
    let rootIdx = -1
    for (const [idxStr, parentIdx] of Object.entries(parentMap)) {
      const idx = parseInt(idxStr)
      if (parentIdx === -1) {
        rootIdx = idx
      }
    }

    // Set root
    this.rootBone = this.bones[rootIdx]
    if (!this.rootBone) return

    this.boneGroup.add(this.rootBone.object3d)

    // Link children to parents (process sorted so parents exist before children)
    // Use BFS from root
    const processed = new Set()
    processed.add(rootIdx)

    // Build adjacency from parentMap
    const childrenOf = {}
    for (const [idxStr, parentIdx] of Object.entries(parentMap)) {
      const idx = parseInt(idxStr)
      if (parentIdx === -1) continue
      if (!childrenOf[parentIdx]) childrenOf[parentIdx] = []
      childrenOf[parentIdx].push(idx)
    }

    const queue = [rootIdx]
    while (queue.length > 0) {
      const current = queue.shift()
      const children = childrenOf[current] || []
      for (const childIdx of children) {
        if (processed.has(childIdx)) continue
        const parentBone = this.bones[current]
        const childBone = this.bones[childIdx]
        if (parentBone && childBone) {
          parentBone.addChild(childBone)
          processed.add(childIdx)
          queue.push(childIdx)
        }
      }
    }

    // Add any orphan bones directly to boneGroup
    this.bones.forEach((bone, idx) => {
      if (bone && !processed.has(idx)) {
        this.boneGroup.add(bone.object3d)
      }
    })

    // Force scene matrix update
    this.boneGroup.updateMatrixWorld(true)
  }

  /**
   * Apply feetScale for BODY_25 by inserting a scale container between each
   * ankle bone and its direct foot children (BigToe, Heel).
   * Called from buildMeshes after _buildBoneHierarchy.
   */
  _applyFeetScale() {
    if (this.feetScale === 1.0) return
    const ankleData = [
      { ankleIdx: 11, directChildIndices: [22, 24] },  // RAnkle → RBigToe, RHeel
      { ankleIdx: 14, directChildIndices: [19, 21] },  // LAnkle → LBigToe, LHeel
    ]
    for (const { ankleIdx, directChildIndices } of ankleData) {
      const ankleBone = this.bones[ankleIdx]
      if (!ankleBone) continue
      const scaleGroup = new THREE.Group()
      scaleGroup.scale.setScalar(this.feetScale)
      ankleBone.object3d.add(scaleGroup)
      for (const childIdx of directChildIndices) {
        const childBone = this.bones[childIdx]
        if (!childBone) continue
        ankleBone.object3d.remove(childBone.object3d)
        scaleGroup.add(childBone.object3d)
      }
    }
    this.boneGroup.updateMatrixWorld(true)
  }

  /**
   * Build keypoint spheres attached to a parent bone's Object3D.
   * Positions are stored relative to the anchor bone so they follow its transforms.
   *
   * Both `keypoints` and `this.keypoints.body[anchorBoneIdx]` are in group-local
   * space, so the sphere offset = kp - anchorLocalPos (group-local subtraction).
   * This is independent of the character's world offset and works correctly on
   * rebuild even when the character has been moved.
   *
   * @param {string} part - keypoint part name ('face', 'rightHand', 'leftHand')
   * @param {THREE.Vector3[]} keypoints - keypoint positions in group-local space
   * @param {string} color - hex color for the spheres
   * @param {number} size - sphere radius
   * @param {number} anchorBoneIdx - index of the body bone to attach to
   * @param {number} [partScale=1.0] - uniform scale applied to the part container relative to the anchor
   */
  _buildAttachedKeypointSpheres(part, keypoints, color, size, anchorBoneIdx, partScale = 1.0) {
    this.meshes[part] = []

    // The container group lives inside the anchor bone's Object3D
    const anchorBone = this.bones[anchorBoneIdx]
    const container = new THREE.Group()
    container.name = `attached_${part}`
    // Apply part-specific scale (scales position and size of spheres relative to anchor)
    if (partScale !== 1.0) container.scale.setScalar(partScale)

    // Store container ref for syncing later
    if (!this._attachedContainers) this._attachedContainers = {}
    this._attachedContainers[part] = { container, anchorBoneIdx }

    // Anchor keypoint in group-local space (same space as `keypoints` array)
    const anchorLocalPos = (this.keypoints.body[anchorBoneIdx] || new THREE.Vector3())

    const geometry = new THREE.SphereGeometry(size, 8, 8)
    keypoints.forEach((kp, idx) => {
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color).multiplyScalar(0.3),
      })
      const sphere = new THREE.Mesh(geometry, material)
      // Offset = face/hand kp relative to anchor body kp (both group-local → same coord space)
      sphere.position.copy(kp).sub(anchorLocalPos)
      sphere.userData = { part, index: idx, characterId: this.id }
      container.add(sphere)
      this.meshes[part].push(sphere)
    })

    if (anchorBone) {
      anchorBone.object3d.add(container)
    } else {
      this.group.add(container)
    }
  }

  _buildConnectionLines(part, keypoints, connections, colors, lineWidth) {
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

  /**
   * Sync flat keypoints array from the bone hierarchy world positions.
   * Called after any bone transform to keep keypoints up-to-date
   * for 2D rendering and serialization.
   */
  syncKeypointsFromBones() {
    // Keep offset in sync with the group's actual world position so that
    // a subsequent buildMeshes() call restores the character to its current
    // location (important when the user translates the whole character).
    this.offset.copy(this.group.position)

    // Update matrix world
    this.boneGroup.updateMatrixWorld(true)

    // Body keypoints from bones
    this.bones.forEach((bone, idx) => {
      if (bone && this.keypoints.body[idx]) {
        const worldPos = bone.getWorldPosition()
        // Convert from group world to group-local
        this.group.worldToLocal(worldPos)
        this.keypoints.body[idx].copy(worldPos)
      }
    })

    // Update body connection lines
    this._updateLines('body')

    // Sync attached parts (face, hands) — read world positions from spheres in bone hierarchy
    const attachedParts = ['face', 'rightHand', 'leftHand']
    for (const part of attachedParts) {
      const meshes = this.meshes[part]
      if (!meshes || meshes.length === 0) continue
      meshes.forEach((sphere, idx) => {
        if (this.keypoints[part] && this.keypoints[part][idx]) {
          const worldPos = new THREE.Vector3()
          sphere.getWorldPosition(worldPos)
          this.group.worldToLocal(worldPos)
          this.keypoints[part][idx].copy(worldPos)
        }
      })
      this._updateLines(part)
    }
  }

  _updateLines(part) {
    const linesGroup = this.lines[part]
    if (!linesGroup) return

    const keypoints = this.keypoints[part]
    const connections = this._getConnections(part)
    if (!connections) return

    linesGroup.children.forEach((line, idx) => {
      if (idx >= connections.length) return
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

  updateKeypointPosition(part, index, newPosition) {
    if (!this.keypoints[part] || !this.keypoints[part][index]) return
    this.keypoints[part][index].copy(newPosition)

    // Update sphere position for non-bone parts
    if (part !== 'body') {
      const sphere = this.meshes[part] && this.meshes[part][index]
      if (sphere) sphere.position.copy(newPosition)
    }

    this._updateLines(part)
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

  /**
   * Get all bone meshes for raycasting (body bones only).
   */
  getAllBoneMeshes() {
    return this.bones.filter(b => b).map(b => b.mesh)
  }

  /**
   * Get all meshes (bones + face + hands) for legacy compatibility.
   */
  getAllMeshes() {
    return [
      ...this.getAllBoneMeshes(),
      ...(this.meshes.face || []),
      ...(this.meshes.rightHand || []),
      ...(this.meshes.leftHand || []),
    ]
  }

  getBoneById(boneId) {
    return this.bones.find(b => b && b.id === boneId) || null
  }

  toJSON() {
    // Sync keypoints before serializing; also updates this.offset
    this.syncKeypointsFromBones()
    return {
      id: this.id,
      name: this.name,
      bodyFormat: this.bodyFormat,
      offset: this.group.position.toArray(),
      showBody: this.showBody,
      showFace: this.showFace,
      showHands: this.showHands,
      charScale: this.charScale,
      handScale: this.handScale,
      faceScale: this.faceScale,
      feetScale: this.feetScale,
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
    this.charScale = data.charScale ?? 1.0
    this.handScale = data.handScale ?? 1.0
    this.faceScale = data.faceScale ?? 1.0
    this.feetScale = data.feetScale ?? 1.0
    this.keypoints.body = data.keypoints.body.map(a => new THREE.Vector3(...a))
    this.keypoints.face = data.keypoints.face.map(a => new THREE.Vector3(...a))
    this.keypoints.rightHand = data.keypoints.rightHand.map(a => new THREE.Vector3(...a))
    this.keypoints.leftHand = data.keypoints.leftHand.map(a => new THREE.Vector3(...a))
  }
}
