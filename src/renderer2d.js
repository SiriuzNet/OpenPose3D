/**
 * 2D Canvas renderer for OpenPose-compatible output.
 * Renders body, face, and hand skeletons to a flat 2D canvas
 * suitable for use with ControlNet SDXL.
 */
import {
  BODY25_CONNECTIONS,
  BODY25_CONNECTION_COLORS,
  COCO18_CONNECTIONS,
} from './skeleton/body.js'
import { FACE_CONNECTIONS, FACE_COLOR } from './skeleton/face.js'
import { HAND_CONNECTIONS, HAND_CONNECTION_COLORS } from './skeleton/hands.js'

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = canvas.width
    this.height = canvas.height
    this.backgroundColor = '#000000'
    this.backgroundImage = null
  }

  resize(width, height) {
    this.canvas.width = width
    this.canvas.height = height
    this.width = width
    this.height = height
  }

  setBackgroundColor(color) {
    this.backgroundColor = color
  }

  setBackgroundImage(img) {
    this.backgroundImage = img
  }

  /**
   * Project a 3D point through the given camera to 2D canvas coordinates.
   */
  _project(point3d, camera) {
    const v = point3d.clone()
    v.project(camera)
    return {
      x: (v.x + 1) * 0.5 * this.width,
      y: (-v.y + 1) * 0.5 * this.height,
      visible: v.z < 1,
    }
  }

  /**
   * Render all characters to the 2D canvas.
   */
  render(characters, camera, settings) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, this.height)

    // Background
    if (this.backgroundImage) {
      ctx.drawImage(this.backgroundImage, 0, 0, this.width, this.height)
    } else {
      ctx.fillStyle = this.backgroundColor
      ctx.fillRect(0, 0, this.width, this.height)
    }

    // Scale marker sizes relative to canvas height (normalized around 768px)
    const scale = this.height / 768

    for (const character of characters) {
      if (character.showBody) {
        this._renderSkeleton(
          character.keypoints.body,
          character.bodyFormat === 'BODY_25' ? BODY25_CONNECTIONS : COCO18_CONNECTIONS,
          character.bodyFormat === 'BODY_25' ? BODY25_CONNECTION_COLORS : null,
          camera, settings.bodyColor, settings.markerSize * 300 * scale, settings.lineWidth2D * scale,
        )
      }

      if (character.showFace) {
        this._renderSkeleton(
          character.keypoints.face,
          FACE_CONNECTIONS,
          FACE_COLOR,
          camera, settings.faceColor, settings.faceMarkerSize * 250 * scale, settings.lineWidth2D * scale,
        )
      }

      if (character.showHands) {
        this._renderSkeleton(
          character.keypoints.rightHand,
          HAND_CONNECTIONS,
          HAND_CONNECTION_COLORS,
          camera, settings.handColor, settings.handMarkerSize * 270 * scale, settings.lineWidth2D * scale,
        )
        this._renderSkeleton(
          character.keypoints.leftHand,
          HAND_CONNECTIONS,
          HAND_CONNECTION_COLORS,
          camera, settings.handColor, settings.handMarkerSize * 270 * scale, settings.lineWidth2D * scale,
        )
      }
    }
  }

  _renderSkeleton(keypoints, connections, colors, camera, defaultColor, markerRadius, lineWidth) {
    const ctx = this.ctx
    const projected = keypoints.map(kp => this._project(kp, camera))

    // Draw connections
    ctx.lineWidth = lineWidth || 2
    connections.forEach(([from, to], idx) => {
      const p0 = projected[from]
      const p1 = projected[to]
      if (!p0 || !p1 || !p0.visible || !p1.visible) return

      ctx.strokeStyle = Array.isArray(colors) ? (colors[idx] || defaultColor) : (colors || defaultColor)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    })

    // Draw keypoint circles
    projected.forEach((p, idx) => {
      if (!p.visible) return
      const color = defaultColor
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(p.x, p.y, markerRadius, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  toDataURL() {
    return this.canvas.toDataURL('image/png')
  }
}
