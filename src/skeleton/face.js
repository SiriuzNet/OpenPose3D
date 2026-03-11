/**
 * Face skeleton definitions.
 * Uses dlib 68-point facial landmark layout.
 */

// 68-point facial landmark keypoint names
export const FACE_KEYPOINTS = [
  // Jaw outline (0-16)
  'Jaw0', 'Jaw1', 'Jaw2', 'Jaw3', 'Jaw4', 'Jaw5', 'Jaw6', 'Jaw7', 'Jaw8',
  'Jaw9', 'Jaw10', 'Jaw11', 'Jaw12', 'Jaw13', 'Jaw14', 'Jaw15', 'Jaw16',
  // Right eyebrow (17-21)
  'REyebrow0', 'REyebrow1', 'REyebrow2', 'REyebrow3', 'REyebrow4',
  // Left eyebrow (22-26)
  'LEyebrow0', 'LEyebrow1', 'LEyebrow2', 'LEyebrow3', 'LEyebrow4',
  // Nose bridge (27-30)
  'NoseBridge0', 'NoseBridge1', 'NoseBridge2', 'NoseBridge3',
  // Nose tip (31-35)
  'NoseTip0', 'NoseTip1', 'NoseTip2', 'NoseTip3', 'NoseTip4',
  // Right eye (36-41)
  'REye0', 'REye1', 'REye2', 'REye3', 'REye4', 'REye5',
  // Left eye (42-47)
  'LEye0', 'LEye1', 'LEye2', 'LEye3', 'LEye4', 'LEye5',
  // Outer mouth (48-59)
  'MouthOuter0', 'MouthOuter1', 'MouthOuter2', 'MouthOuter3', 'MouthOuter4',
  'MouthOuter5', 'MouthOuter6', 'MouthOuter7', 'MouthOuter8', 'MouthOuter9',
  'MouthOuter10', 'MouthOuter11',
  // Inner mouth (60-67)
  'MouthInner0', 'MouthInner1', 'MouthInner2', 'MouthInner3',
  'MouthInner4', 'MouthInner5', 'MouthInner6', 'MouthInner7',
]

// Face skeleton connections
export const FACE_CONNECTIONS = [
  // Jaw outline
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],
  // Right eyebrow
  [17,18],[18,19],[19,20],[20,21],
  // Left eyebrow
  [22,23],[23,24],[24,25],[25,26],
  // Nose bridge
  [27,28],[28,29],[29,30],
  // Nose tip
  [31,32],[32,33],[33,34],[34,35],[30,33],
  // Right eye
  [36,37],[37,38],[38,39],[39,40],[40,41],[41,36],
  // Left eye
  [42,43],[43,44],[44,45],[45,46],[46,47],[47,42],
  // Outer mouth
  [48,49],[49,50],[50,51],[51,52],[52,53],[53,54],[54,55],[55,56],[56,57],[57,58],[58,59],[59,48],
  // Inner mouth
  [60,61],[61,62],[62,63],[63,64],[64,65],[65,66],[66,67],[67,60],
]

export const FACE_COLOR = '#00ffff'

/**
 * Generate default face keypoints positioned around the head of a body.
 * headCenter: [x, y, z] position of head center (between eyes/nose area)
 * headScale: size of head
 */
export function getDefaultFacePose(headCenter = [0, 0.87, 0], headScale = 0.12) {
  const [cx, cy, cz] = headCenter
  const s = headScale

  // 68 points laid out around a face
  const pts = []

  // Jaw outline (0-16) - bottom half of face
  for (let i = 0; i <= 16; i++) {
    const t = (i - 8) / 8 // -1 to 1
    const angle = Math.PI - Math.acos(t) // 0 to PI from right
    pts.push([cx + s * t, cy - s * 0.6 + s * 0.4 * Math.abs(Math.sin(angle * 0.7)), cz])
  }

  // Right eyebrow (17-21)
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    pts.push([cx + s * (0.1 + 0.4 * t), cy + s * 0.35 + s * 0.05 * Math.sin(t * Math.PI), cz])
  }

  // Left eyebrow (22-26)
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    pts.push([cx - s * (0.1 + 0.4 * t), cy + s * 0.35 + s * 0.05 * Math.sin(t * Math.PI), cz])
  }

  // Nose bridge (27-30)
  for (let i = 0; i < 4; i++) {
    pts.push([cx, cy + s * (0.25 - i * 0.15), cz])
  }

  // Nose tip (31-35)
  pts.push([cx - s * 0.2, cy - s * 0.1, cz])
  pts.push([cx - s * 0.1, cy - s * 0.15, cz])
  pts.push([cx, cy - s * 0.18, cz])
  pts.push([cx + s * 0.1, cy - s * 0.15, cz])
  pts.push([cx + s * 0.2, cy - s * 0.1, cz])

  // Right eye (36-41)
  const reye = [cx + s * 0.28, cy + s * 0.15, cz]
  const eyeW = s * 0.15
  const eyeH = s * 0.06
  pts.push([reye[0] - eyeW, reye[1], cz])
  pts.push([reye[0] - eyeW * 0.5, reye[1] + eyeH, cz])
  pts.push([reye[0] + eyeW * 0.5, reye[1] + eyeH, cz])
  pts.push([reye[0] + eyeW, reye[1], cz])
  pts.push([reye[0] + eyeW * 0.5, reye[1] - eyeH, cz])
  pts.push([reye[0] - eyeW * 0.5, reye[1] - eyeH, cz])

  // Left eye (42-47)
  const leye = [cx - s * 0.28, cy + s * 0.15, cz]
  pts.push([leye[0] - eyeW, leye[1], cz])
  pts.push([leye[0] - eyeW * 0.5, leye[1] + eyeH, cz])
  pts.push([leye[0] + eyeW * 0.5, leye[1] + eyeH, cz])
  pts.push([leye[0] + eyeW, leye[1], cz])
  pts.push([leye[0] + eyeW * 0.5, leye[1] - eyeH, cz])
  pts.push([leye[0] - eyeW * 0.5, leye[1] - eyeH, cz])

  // Outer mouth (48-59) - proper elliptical layout
  const mouthW = s * 0.3
  const mouthTopH = s * 0.07
  const mouthBotH = s * 0.12
  const mouthCy = cy - s * 0.3
  // 12 points around mouth: 0=left corner, going clockwise
  const mouthAngles = [
    Math.PI,         // 48 left corner
    Math.PI * 5/6,   // 49
    Math.PI * 4/6,   // 50 top center-left
    Math.PI * 3/6,   // 51 top center
    Math.PI * 2/6,   // 52 top center-right
    Math.PI * 1/6,   // 53
    0,               // 54 right corner
    -Math.PI * 1/6,  // 55
    -Math.PI * 2/6,  // 56 bottom center-right
    -Math.PI * 3/6,  // 57 bottom center
    -Math.PI * 4/6,  // 58 bottom center-left
    -Math.PI * 5/6,  // 59
  ]
  mouthAngles.forEach(a => {
    const yH = Math.sin(a) >= 0 ? mouthTopH : mouthBotH
    pts.push([cx + mouthW * Math.cos(a), mouthCy + yH * Math.sin(a), cz])
  })

  // Inner mouth (60-67)
  const iMouthW = s * 0.22
  const iMouthTopH = s * 0.05
  const iMouthBotH = s * 0.09
  const innerAngles = [
    Math.PI, Math.PI * 4/6, Math.PI * 2/6, 0,
    -Math.PI * 2/6, -Math.PI * 3/6, -Math.PI * 4/6, -Math.PI,
  ]
  innerAngles.forEach(a => {
    const yH = Math.sin(a) >= 0 ? iMouthTopH : iMouthBotH
    pts.push([cx + iMouthW * Math.cos(a), mouthCy + yH * Math.sin(a), cz])
  })

  return pts
}
