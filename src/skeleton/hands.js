/**
 * Hand skeleton definitions.
 * Uses MediaPipe 21-point hand landmark layout.
 */

// 21-point hand keypoint names
export const HAND_KEYPOINTS = [
  'Wrist',          // 0
  'Thumb0',         // 1  CMC
  'Thumb1',         // 2  MCP
  'Thumb2',         // 3  IP
  'ThumbTip',       // 4  TIP
  'Index0',         // 5  MCP
  'Index1',         // 6  PIP
  'Index2',         // 7  DIP
  'IndexTip',       // 8  TIP
  'Middle0',        // 9  MCP
  'Middle1',        // 10 PIP
  'Middle2',        // 11 DIP
  'MiddleTip',      // 12 TIP
  'Ring0',          // 13 MCP
  'Ring1',          // 14 PIP
  'Ring2',          // 15 DIP
  'RingTip',        // 16 TIP
  'Pinky0',         // 17 MCP
  'Pinky1',         // 18 PIP
  'Pinky2',         // 19 DIP
  'PinkyTip',       // 20 TIP
]

// Hand connections
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky finger
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
]

// Colors for hand connections
export const HAND_CONNECTION_COLORS = [
  // Thumb (yellow)
  '#ffff00', '#ffee00', '#ffdd00', '#ffcc00',
  // Index (green)
  '#00ff00', '#00ee00', '#00dd00', '#00cc00',
  // Middle (cyan)
  '#00ffff', '#00eeff', '#00ddff', '#00ccff',
  // Ring (blue)
  '#0066ff', '#0055ff', '#0044ff', '#0033ff',
  // Pinky (magenta)
  '#ff00ff', '#ee00ff', '#dd00ff', '#cc00ff',
  // Palm
  '#ffffff', '#ffffff', '#ffffff',
]

/**
 * Generate default right hand pose.
 * wristPos: [x, y, z] position of wrist
 * scale: size of hand
 * isLeft: whether this is the left hand (mirrors x)
 */
export function getDefaultHandPose(wristPos = [0.5, 0.2, 0], scale = 0.12, isLeft = false) {
  const [wx, wy, wz] = wristPos
  const mirror = isLeft ? -1 : 1
  const s = scale

  const pts = []

  // Wrist
  pts.push([wx, wy, wz])

  // Thumb (angled to the side)
  pts.push([wx + mirror * s * 0.15, wy - s * 0.05, wz])
  pts.push([wx + mirror * s * 0.25, wy - s * 0.15, wz])
  pts.push([wx + mirror * s * 0.35, wy - s * 0.22, wz])
  pts.push([wx + mirror * s * 0.42, wy - s * 0.28, wz])

  // Index finger
  pts.push([wx + mirror * s * 0.1, wy - s * 0.05, wz])
  pts.push([wx + mirror * s * 0.12, wy - s * 0.2, wz])
  pts.push([wx + mirror * s * 0.13, wy - s * 0.32, wz])
  pts.push([wx + mirror * s * 0.13, wy - s * 0.42, wz])

  // Middle finger
  pts.push([wx, wy - s * 0.05, wz])
  pts.push([wx, wy - s * 0.22, wz])
  pts.push([wx, wy - s * 0.34, wz])
  pts.push([wx, wy - s * 0.45, wz])

  // Ring finger
  pts.push([wx - mirror * s * 0.1, wy - s * 0.05, wz])
  pts.push([wx - mirror * s * 0.12, wy - s * 0.2, wz])
  pts.push([wx - mirror * s * 0.13, wy - s * 0.32, wz])
  pts.push([wx - mirror * s * 0.13, wy - s * 0.4, wz])

  // Pinky finger
  pts.push([wx - mirror * s * 0.2, wy - s * 0.05, wz])
  pts.push([wx - mirror * s * 0.22, wy - s * 0.17, wz])
  pts.push([wx - mirror * s * 0.23, wy - s * 0.27, wz])
  pts.push([wx - mirror * s * 0.23, wy - s * 0.35, wz])

  return pts
}
