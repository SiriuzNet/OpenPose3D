"""
OpenPose3D Python renderer.
Converts scene JSON (produced by the web editor) to a PIL Image using
the same perspective projection as the Three.js renderer2d.js.
"""
import json
import math
import numpy as np
from PIL import Image, ImageDraw

# ── Skeleton connection definitions (mirror of src/skeleton/*.js) ─────────────

BODY25_CONNECTIONS = [
    (1, 8),   # neck -> midhip
    (1, 2),   # neck -> rshoulder
    (2, 3),   # rshoulder -> relbow
    (3, 4),   # relbow -> rwrist
    (1, 5),   # neck -> lshoulder
    (5, 6),   # lshoulder -> lelbow
    (6, 7),   # lelbow -> lwrist
    (8, 9),   # midhip -> rhip
    (9, 10),  # rhip -> rknee
    (10, 11), # rknee -> rankle
    (8, 12),  # midhip -> lhip
    (12, 13), # lhip -> lknee
    (13, 14), # lknee -> lankle
    (1, 0),   # neck -> nose
    (0, 15),  # nose -> reye
    (15, 17), # reye -> rear
    (0, 16),  # nose -> leye
    (16, 18), # leye -> lear
    (14, 19), # lankle -> lbigtoe
    (19, 20), # lbigtoe -> lsmalltoe
    (14, 21), # lankle -> lheel
    (11, 22), # rankle -> rbigtoe
    (22, 23), # rbigtoe -> rsmalltoe
    (11, 24), # rankle -> rheel
]

BODY25_COLORS = [
    (255, 0, 85),   (255, 85, 0),   (255, 170, 0),  (255, 255, 0),
    (0, 255, 0),    (0, 255, 170),  (0, 255, 255),
    (0, 85, 255),   (0, 0, 255),    (85, 0, 255),
    (170, 0, 255),  (255, 0, 255),  (255, 0, 136),
    (255, 102, 0),  (255, 204, 0),  (255, 255, 136), (204, 255, 0), (136, 255, 0),
    (0, 255, 68),   (0, 255, 153),  (0, 255, 204),
    (0, 204, 255),  (0, 153, 255),  (0, 68, 255),
]

COCO18_CONNECTIONS = [
    (0, 1),   # nose -> neck
    (1, 2),   # neck -> rshoulder
    (2, 3),   # rshoulder -> relbow
    (3, 4),   # relbow -> rwrist
    (1, 5),   # neck -> lshoulder
    (5, 6),   # lshoulder -> lelbow
    (6, 7),   # lelbow -> lwrist
    (1, 8),   # neck -> rhip
    (8, 9),   # rhip -> rknee
    (9, 10),  # rknee -> rankle
    (1, 11),  # neck -> lhip
    (11, 12), # lhip -> lknee
    (12, 13), # lknee -> lankle
    (0, 14),  # nose -> reye
    (14, 16), # reye -> rear
    (0, 15),  # nose -> leye
    (15, 17), # leye -> lear
]

FACE_CONNECTIONS = [
    # Jaw outline
    (0,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,7),(7,8),
    (8,9),(9,10),(10,11),(11,12),(12,13),(13,14),(14,15),(15,16),
    # Right eyebrow
    (17,18),(18,19),(19,20),(20,21),
    # Left eyebrow
    (22,23),(23,24),(24,25),(25,26),
    # Nose bridge
    (27,28),(28,29),(29,30),
    # Nose tip
    (31,32),(32,33),(33,34),(34,35),(30,33),
    # Right eye
    (36,37),(37,38),(38,39),(39,40),(40,41),(41,36),
    # Left eye
    (42,43),(43,44),(44,45),(45,46),(46,47),(47,42),
    # Outer mouth
    (48,49),(49,50),(50,51),(51,52),(52,53),(53,54),
    (54,55),(55,56),(56,57),(57,58),(58,59),(59,48),
    # Inner mouth
    (60,61),(61,62),(62,63),(63,64),(64,65),(65,66),(66,67),(67,60),
]

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),      # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),      # Index
    (0, 9), (9, 10), (10, 11), (11, 12), # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17),            # Palm
]

HAND_COLORS = [
    (255, 255, 0), (255, 238, 0), (255, 221, 0), (255, 204, 0),
    (0, 255, 0),   (0, 238, 0),   (0, 221, 0),   (0, 204, 0),
    (0, 255, 255), (0, 238, 255), (0, 221, 255), (0, 204, 255),
    (0, 102, 255), (0, 85, 255),  (0, 68, 255),  (0, 51, 255),
    (255, 0, 255), (238, 0, 255), (221, 0, 255), (204, 0, 255),
    (255, 255, 255), (255, 255, 255), (255, 255, 255),
]

# Per-keypoint colors for hand joints (used to color each dot individually)
# Matches HAND_KEYPOINT_COLORS in hands.js
HAND_KEYPOINT_COLORS = [
    (255, 255, 255),                                               # 0  Wrist
    (255, 255, 0), (255, 238, 0), (255, 221, 0), (255, 204, 0),   # 1-4  Thumb
    (0, 255, 0),   (0, 238, 0),   (0, 221, 0),   (0, 204, 0),    # 5-8  Index
    (0, 255, 255), (0, 238, 255), (0, 221, 255), (0, 204, 255),   # 9-12 Middle
    (0, 102, 255), (0, 85, 255),  (0, 68, 255),  (0, 51, 255),   # 13-16 Ring
    (255, 0, 255), (238, 0, 255), (221, 0, 255), (204, 0, 255),   # 17-20 Pinky
]


# ── Helper functions ──────────────────────────────────────────────────────────

def hex_to_rgb(hex_str: str) -> tuple:
    """Convert #rrggbb hex string to (r, g, b) tuple."""
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _build_view_projection(width, height, camera_pos, camera_target, fov_y_deg):
    """
    Build 4×4 view-projection matrix matching a Three.js PerspectiveCamera.

    Supports arbitrary camera position and look-at target so that orbit /
    pan / zoom movements in the 3D editor are faithfully reproduced.
    """
    aspect = width / height
    pos = np.array(camera_pos, dtype=np.float64)
    target = np.array(camera_target, dtype=np.float64)
    up = np.array([0.0, 1.0, 0.0])

    forward = target - pos
    fwd_len = np.linalg.norm(forward)
    if fwd_len < 1e-10:
        forward = np.array([0.0, 0.0, -1.0])
    else:
        forward = forward / fwd_len

    right = np.cross(forward, up)
    right_len = np.linalg.norm(right)
    if right_len < 1e-10:
        # Camera looking straight up/down – pick a fallback up vector
        up = np.array([0.0, 0.0, -1.0])
        right = np.cross(forward, up)
        right_len = np.linalg.norm(right)
    right = right / right_len
    up2 = np.cross(right, forward)

    # View matrix  (world → eye)
    view = np.eye(4, dtype=np.float64)
    view[0, 0:3] = right
    view[1, 0:3] = up2
    view[2, 0:3] = -forward
    view[0, 3] = -float(np.dot(right, pos))
    view[1, 3] = -float(np.dot(up2, pos))
    view[2, 3] = float(np.dot(forward, pos))

    # Perspective projection matrix  (Three.js convention)
    f = 1.0 / math.tan(math.radians(fov_y_deg / 2.0))
    near, far = 0.01, 100.0
    proj = np.zeros((4, 4), dtype=np.float64)
    proj[0, 0] = f / aspect
    proj[1, 1] = f
    proj[2, 2] = (far + near) / (near - far)
    proj[2, 3] = (2.0 * far * near) / (near - far)
    proj[3, 2] = -1.0

    return proj @ view


def _project_point(x, y, z, vp, width, height):
    """Project a 3D world-space point using a precomputed VP matrix."""
    clip = vp @ np.array([x, y, z, 1.0], dtype=np.float64)
    w = clip[3]
    if w <= 1e-6:
        return None
    ndc_x = clip[0] / w
    ndc_y = clip[1] / w
    screen_x = (ndc_x + 1.0) * 0.5 * width
    screen_y = (-ndc_y + 1.0) * 0.5 * height
    return (screen_x, screen_y)


# ── Main render function ──────────────────────────────────────────────────────

def render_scene(
    scene_json: str,
    width: int = 512,
    height: int = 768,
    camera_z: float = 3.5,
    fov: float = 45.0,
) -> Image.Image:
    """
    Render an OpenPose3D scene JSON string to a PIL RGB Image.

    The JSON format is the output of the web editor's saveJSON() function:
    {
      "settings": { bodyColor, faceColor, handColor, markerSize, ... },
      "characters": [
        {
          "bodyFormat": "BODY_25",
          "offset": [ox, oy, oz],
          "showBody": true,
          "showFace": true,
          "showHands": true,
          "keypoints": {
            "body":      [[x,y,z], ...],  // BODY_25: 25 pts, COCO-18: 18 pts
            "face":      [[x,y,z], ...],  // 68 pts
            "rightHand": [[x,y,z], ...],  // 21 pts
            "leftHand":  [[x,y,z], ...]   // 21 pts
          }
        }, ...
      ]
    }
    """
    # Parse JSON
    try:
        scene = json.loads(scene_json) if isinstance(scene_json, str) else (scene_json or {})
    except (json.JSONDecodeError, TypeError):
        scene = {}

    characters = scene.get("characters", [])
    settings = scene.get("settings", {})

    # Extract camera state (saved by the 3D editor) or fall back to defaults
    camera_data = scene.get("camera")
    if camera_data:
        cam_pos    = camera_data.get("position", [0, 0, camera_z])
        cam_target = camera_data.get("target",   [0, 0, 0])
        cam_fov    = camera_data.get("fov",       fov)
    else:
        cam_pos    = [0, 0, camera_z]
        cam_target = [0, 0, 0]
        cam_fov    = fov

    vp = _build_view_projection(width, height, cam_pos, cam_target, cam_fov)

    # Settings → colors and sizes
    bg_color    = hex_to_rgb(settings.get("backgroundColor", "#000000"))
    body_color  = hex_to_rgb(settings.get("bodyColor",  "#ff6644"))
    face_color  = hex_to_rgb(settings.get("faceColor",  "#00ffff"))
    hand_color  = hex_to_rgb(settings.get("handColor",  "#ffff00"))

    marker_size      = float(settings.get("markerSize",      0.025))
    face_marker_size = float(settings.get("faceMarkerSize",  0.012))
    hand_marker_size = float(settings.get("handMarkerSize",  0.015))

    # Scale all sizes relative to canvas height so they look consistent
    # across different output resolutions (matches renderer2d.js logic).
    scale       = height / 768.0
    body_radius = max(1, int(marker_size      * 300 * scale))
    face_radius = max(1, int(face_marker_size * 250 * scale))
    hand_radius = max(1, int(hand_marker_size * 270 * scale))
    line_width_2d = max(1, int(settings.get("lineWidth2D", 3) * scale))

    # Create image
    img  = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    def project(kp, offset):
        return _project_point(
            kp[0] + offset[0],
            kp[1] + offset[1],
            kp[2] + offset[2],
            vp, width, height,
        )

    def draw_skeleton(keypoints, connections, colors, offset, radius, lw, kp_colors=None):
        """Draw connections then keypoint circles.

        Parameters
        ----------
        kp_colors : list or None
            Per-keypoint colour list (same length as *keypoints*).  When given
            each dot is coloured individually; otherwise the first colour from
            *colors* is used for all dots.
        """
        projected = [project(kp, offset) for kp in keypoints]

        # Connections
        for i, (fr, to) in enumerate(connections):
            if fr >= len(projected) or to >= len(projected):
                continue
            p0, p1 = projected[fr], projected[to]
            if p0 is None or p1 is None:
                continue
            color = colors[i] if isinstance(colors, list) and i < len(colors) else colors
            draw.line([p0, p1], fill=color, width=lw)

        # Keypoints — optionally per-keypoint coloured
        for idx, p in enumerate(projected):
            if p is None:
                continue
            x, y = p
            r = radius
            if kp_colors is not None:
                kpc = kp_colors[idx] if idx < len(kp_colors) else kp_colors[0]
            else:
                kpc = colors[0] if isinstance(colors, list) and colors else colors
            draw.ellipse([x - r, y - r, x + r, y + r], fill=kpc)

    def draw_face_dots(keypoints, offset, radius):
        """Draw face keypoints as white dots with NO connecting lines.

        This matches the visual style of huchenlei/ComfyUI-openpose-editor
        where the 68-point face mesh is shown as a ring of white dots.

        Parameters
        ----------
        keypoints : list of [x, y, z]
            3D coordinates of the 68 face landmarks.
        offset : list of [x, y, z]
            World-space offset of the character (from character.get("offset")).
        radius : int
            Dot radius in pixels.
        """
        projected = [project(kp, offset) for kp in keypoints]
        for p in projected:
            if p is None:
                continue
            x, y = p
            draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(255, 255, 255))

    # Draw each character
    for char in characters:
        offset   = char.get("offset", [0.0, 0.0, 0.0])
        body_fmt = char.get("bodyFormat", "BODY_25")
        kpts     = char.get("keypoints", {})

        if char.get("showBody", True):
            body_kpts = kpts.get("body", [])
            if body_kpts:
                if body_fmt == "BODY_25":
                    conns  = BODY25_CONNECTIONS
                    colors = BODY25_COLORS
                else:
                    conns  = COCO18_CONNECTIONS
                    colors = [body_color] * len(COCO18_CONNECTIONS)
                draw_skeleton(body_kpts, conns, colors, offset, body_radius, line_width_2d)

        if char.get("showFace", True):
            face_kpts = kpts.get("face", [])
            if face_kpts:
                draw_face_dots(face_kpts, offset, face_radius)

        if char.get("showHands", True):
            rhand = kpts.get("rightHand", [])
            if rhand:
                draw_skeleton(rhand, HAND_CONNECTIONS, HAND_COLORS,
                              offset, hand_radius, line_width_2d,
                              kp_colors=HAND_KEYPOINT_COLORS)
            lhand = kpts.get("leftHand", [])
            if lhand:
                draw_skeleton(lhand, HAND_CONNECTIONS, HAND_COLORS,
                              offset, hand_radius, line_width_2d,
                              kp_colors=HAND_KEYPOINT_COLORS)

    return img


# ── Mask generation ───────────────────────────────────────────────────────────

def render_mask_single(
    character: dict,
    width: int,
    height: int,
    mask_width: int = 40,
    camera_z: float = 3.5,
    fov: float = 45.0,
    include_face: bool = True,
    include_hands: bool = True,
    blur_radius: float = 0.0,
    camera_pos=None,
    camera_target=None,
) -> np.ndarray:
    """
    Render a single character's skeleton as a white silhouette mask on a black canvas.

    Skeleton joints and connections are drawn as thick white strokes.  The
    `mask_width` parameter controls the stroke thickness in pixels (the
    "width" of the mask outline).  An optional Gaussian blur creates soft
    feathered edges.

    Returns:
        float32 numpy array of shape (H, W) with values in [0.0, 1.0].
        1.0 = body region, 0.0 = background.
    """
    from PIL import ImageFilter

    img  = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)

    offset   = character.get("offset", [0.0, 0.0, 0.0])
    body_fmt = character.get("bodyFormat", "BODY_25")
    kpts     = character.get("keypoints", {})

    # Build projection using editor camera state if available
    _cam_pos    = camera_pos    if camera_pos    is not None else [0, 0, camera_z]
    _cam_target = camera_target if camera_target is not None else [0, 0, 0]
    vp = _build_view_projection(width, height, _cam_pos, _cam_target, fov)

    lw = max(1, mask_width)
    r  = max(1, lw // 2)

    def proj(kp):
        return _project_point(
            kp[0] + offset[0],
            kp[1] + offset[1],
            kp[2] + offset[2],
            vp, width, height,
        )

    def draw_thick_skeleton(keypoints, connections):
        if not keypoints:
            return
        projected = [proj(kp) for kp in keypoints]

        # Connections — thick white lines
        for fr, to in connections:
            if fr >= len(projected) or to >= len(projected):
                continue
            p0, p1 = projected[fr], projected[to]
            if p0 is None or p1 is None:
                continue
            draw.line([p0, p1], fill=255, width=lw)

        # Keypoints — filled circles for rounded joints
        for p in projected:
            if p is None:
                continue
            x, y = p
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    if character.get("showBody", True):
        body_kpts = kpts.get("body", [])
        if body_kpts:
            conns = BODY25_CONNECTIONS if body_fmt == "BODY_25" else COCO18_CONNECTIONS
            draw_thick_skeleton(body_kpts, conns)

    if include_face and character.get("showFace", True):
        face_kpts = kpts.get("face", [])
        if face_kpts:
            draw_thick_skeleton(face_kpts, FACE_CONNECTIONS)

    if include_hands and character.get("showHands", True):
        rhand = kpts.get("rightHand", [])
        if rhand:
            draw_thick_skeleton(rhand, HAND_CONNECTIONS)
        lhand = kpts.get("leftHand", [])
        if lhand:
            draw_thick_skeleton(lhand, HAND_CONNECTIONS)

    if blur_radius > 0.0:
        img = img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    return np.array(img, dtype=np.float32) / 255.0
