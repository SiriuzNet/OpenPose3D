/**
 * Body skeleton definitions.
 * Supports both COCO-18 and BODY_25 formats.
 */

// COCO-18 keypoint names
export const COCO18_KEYPOINTS = [
  'Nose',        // 0
  'Neck',        // 1
  'RShoulder',   // 2
  'RElbow',      // 3
  'RWrist',      // 4
  'LShoulder',   // 5
  'LElbow',      // 6
  'LWrist',      // 7
  'RHip',        // 8
  'RKnee',       // 9
  'RAnkle',      // 10
  'LHip',        // 11
  'LKnee',       // 12
  'LAnkle',      // 13
  'REye',        // 14
  'LEye',        // 15
  'REar',        // 16
  'LEar',        // 17
]

// BODY_25 keypoint names (more keypoints for feet)
export const BODY25_KEYPOINTS = [
  'Nose',        // 0
  'Neck',        // 1
  'RShoulder',   // 2
  'RElbow',      // 3
  'RWrist',      // 4
  'LShoulder',   // 5
  'LElbow',      // 6
  'LWrist',      // 7
  'MidHip',      // 8
  'RHip',        // 9
  'RKnee',       // 10
  'RAnkle',      // 11
  'LHip',        // 12
  'LKnee',       // 13
  'LAnkle',      // 14
  'REye',        // 15
  'LEye',        // 16
  'REar',        // 17
  'LEar',        // 18
  'LBigToe',     // 19
  'LSmallToe',   // 20
  'LHeel',       // 21
  'RBigToe',     // 22
  'RSmallToe',   // 23
  'RHeel',       // 24
]

// BODY_25 skeleton connections [from, to]
export const BODY25_CONNECTIONS = [
  [1, 8],   // neck -> midhip
  [1, 2],   // neck -> rshoulder
  [2, 3],   // rshoulder -> relbow
  [3, 4],   // relbow -> rwrist
  [1, 5],   // neck -> lshoulder
  [5, 6],   // lshoulder -> lelbow
  [6, 7],   // lelbow -> lwrist
  [8, 9],   // midhip -> rhip
  [9, 10],  // rhip -> rknee
  [10, 11], // rknee -> rankle
  [8, 12],  // midhip -> lhip
  [12, 13], // lhip -> lknee
  [13, 14], // lknee -> lankle
  [1, 0],   // neck -> nose
  [0, 15],  // nose -> reye
  [15, 17], // reye -> rear
  [0, 16],  // nose -> leye
  [16, 18], // leye -> lear
  [14, 19], // lankle -> lbigtoe
  [19, 20], // lbigtoe -> lsmalltoe
  [14, 21], // lankle -> lheel
  [11, 22], // rankle -> rbigtoe
  [22, 23], // rbigtoe -> rsmalltoe
  [11, 24], // rankle -> rheel
]

// Colors for BODY_25 connections (matches OpenPose convention)
export const BODY25_CONNECTION_COLORS = [
  '#ff0055', // neck-midhip
  '#ff5500', // neck-rshoulder
  '#ffaa00', // rshoulder-relbow
  '#ffff00', // relbow-rwrist
  '#00ff00', // neck-lshoulder
  '#00ffaa', // lshoulder-lelbow
  '#00ffff', // lelbow-lwrist
  '#0055ff', // midhip-rhip
  '#0000ff', // rhip-rknee
  '#5500ff', // rknee-rankle
  '#aa00ff', // midhip-lhip
  '#ff00ff', // lhip-lknee
  '#ff0088', // lknee-lankle
  '#ff6600', // neck-nose
  '#ffcc00', // nose-reye
  '#ffff88', // reye-rear
  '#ccff00', // nose-leye
  '#88ff00', // leye-lear
  '#00ff44', // lankle-lbigtoe
  '#00ff99', // lbigtoe-lsmalltoe
  '#00ffcc', // lankle-lheel
  '#00ccff', // rankle-rbigtoe
  '#0099ff', // rbigtoe-rsmalltoe
  '#0044ff', // rankle-rheel
]

// COCO-18 skeleton connections
export const COCO18_CONNECTIONS = [
  [0, 1],   // nose -> neck
  [1, 2],   // neck -> rshoulder
  [2, 3],   // rshoulder -> relbow
  [3, 4],   // relbow -> rwrist
  [1, 5],   // neck -> lshoulder
  [5, 6],   // lshoulder -> lelbow
  [6, 7],   // lelbow -> lwrist
  [1, 8],   // neck -> rhip
  [8, 9],   // rhip -> rknee
  [9, 10],  // rknee -> rankle
  [1, 11],  // neck -> lhip
  [11, 12], // lhip -> lknee
  [12, 13], // lknee -> lankle
  [0, 14],  // nose -> reye
  [14, 16], // reye -> rear
  [0, 15],  // nose -> leye
  [15, 17], // leye -> lear
]

// Default body pose in normalized coordinates (range -1 to 1)
// Y is up, X is right, Z is toward camera
export function getDefaultBodyPose(format = 'BODY_25') {
  if (format === 'BODY_25') {
    return [
      [0, 0.85, 0],     // 0 Nose
      [0, 0.7, 0],      // 1 Neck
      [0.18, 0.7, 0],   // 2 RShoulder
      [0.35, 0.45, 0],  // 3 RElbow
      [0.5, 0.2, 0],    // 4 RWrist
      [-0.18, 0.7, 0],  // 5 LShoulder
      [-0.35, 0.45, 0], // 6 LElbow
      [-0.5, 0.2, 0],   // 7 LWrist
      [0, 0.2, 0],      // 8 MidHip
      [0.12, 0.2, 0],   // 9 RHip
      [0.14, -0.2, 0],  // 10 RKnee
      [0.14, -0.65, 0], // 11 RAnkle
      [-0.12, 0.2, 0],  // 12 LHip
      [-0.14, -0.2, 0], // 13 LKnee
      [-0.14, -0.65, 0],// 14 LAnkle
      [0.05, 0.9, 0],   // 15 REye
      [-0.05, 0.9, 0],  // 16 LEye
      [0.12, 0.85, 0],  // 17 REar
      [-0.12, 0.85, 0], // 18 LEar
      [-0.18, -0.72, 0],// 19 LBigToe
      [-0.22, -0.72, 0],// 20 LSmallToe
      [-0.1, -0.72, 0], // 21 LHeel
      [0.18, -0.72, 0], // 22 RBigToe
      [0.22, -0.72, 0], // 23 RSmallToe
      [0.1, -0.72, 0],  // 24 RHeel
    ]
  }
  // COCO-18 default pose
  return [
    [0, 0.85, 0],
    [0, 0.7, 0],
    [0.18, 0.7, 0],
    [0.35, 0.45, 0],
    [0.5, 0.2, 0],
    [-0.18, 0.7, 0],
    [-0.35, 0.45, 0],
    [-0.5, 0.2, 0],
    [0.12, 0.2, 0],
    [0.14, -0.2, 0],
    [0.14, -0.65, 0],
    [-0.12, 0.2, 0],
    [-0.14, -0.2, 0],
    [-0.14, -0.65, 0],
    [0.05, 0.9, 0],
    [-0.05, 0.9, 0],
    [0.12, 0.85, 0],
    [-0.12, 0.85, 0],
  ]
}
