# OpenPose3D

**OpenPose3D** is a 3D OpenPose skeleton editor for generating pose control images compatible with [ControlNet SDXL](https://huggingface.co/docs/diffusers/using-diffusers/controlnet). It is inspired by [open-pose-editor](https://github.com/ZhUyU1997/open-pose-editor) and [ComfyUI-openpose-editor](https://github.com/huchenlei/ComfyUI-openpose-editor), extending them with full 3D editing, adjustable marker sizes, and foot/hand detail.

It ships as **both** a standalone web editor **and** a [ComfyUI](https://github.com/comfyanonymous/ComfyUI) custom node so the same workflow works whether you use the browser directly or from inside ComfyUI.

| Standalone editor | ComfyUI mode (embedded) |
|---|---|
| ![Standalone](https://github.com/user-attachments/assets/13ae18d2-723e-4e00-a58d-6fb18870461d) | ![ComfyUI mode](https://github.com/user-attachments/assets/b36bb6b6-4028-4ed4-9c0e-921d43fedfb8) |

## Features

- **3D viewport** powered by [Three.js](https://threejs.org/) — orbit, pan, and zoom to view the pose from any angle
- **Draggable keypoints** — drag any joint in 3D space directly on the canvas
- **BODY_25** (25-point) and **COCO-18** (18-point) skeleton formats
  - BODY_25 includes detailed **foot keypoints** (big toe, small toe, heel) for precise foot positioning
- **68-point face landmarks** — jaw outline, eyebrows, nose, eyes, and mouth
- **21-point hand landmarks** per hand — full finger articulation
- **Multiple characters** — add/remove characters; each is independently editable
- **Adjustable marker sizes** — separate size controls for body, face, and hand keypoints
- **Per-character visibility** — toggle body, face, hands independently
- **Background image support** — load any image as 3D scene background
- **2D ControlNet preview** — live preview of the flat OpenPose skeleton output
- **Export PNG** — renders a clean OpenPose skeleton image at your chosen resolution (default 512×768)
- **Save / Load JSON** — serialize and restore full scene (all characters, pose, settings)
- **Keyboard shortcuts**: `Ctrl+S` save, `Ctrl+E` export, `Ctrl+N` add character, `Ctrl+Z` reset pose
- **ComfyUI custom node** — `OpenPose3DEditor` node with embedded 3D editor, thumbnail preview, and Python PIL renderer

---

## Standalone Web Editor

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Build

```bash
npm run build
```

The static output is placed in `dist/`.

### Usage

1. **Add a character** with the toolbar button (or `Ctrl+N`)
2. **Drag keypoints** in the 3D viewport to adjust the pose
3. **Orbit** the camera with left-drag, **pan** with right-drag, **zoom** with scroll
4. Adjust **marker sizes** and **colors** in the Settings panel
5. Toggle **face / hands / body** visibility per character in the Parts Visibility panel
6. Click **Export PNG** (or `Ctrl+E`) to download the ControlNet-ready skeleton image

---

## ComfyUI Custom Node

The repository doubles as a ComfyUI custom node. Clone it directly into your `custom_nodes/` folder and it registers the **`OpenPose3DEditor`** node automatically.

### Installation

```bash
# Inside your ComfyUI installation:
cd custom_nodes
git clone https://github.com/SiriuzNet/OpenPose3D.git OpenPose3D
```

Then install the Python dependencies:

```bash
pip install -r custom_nodes/OpenPose3D/requirements.txt
```

Restart ComfyUI. The **OpenPose3D Editor** node appears under the **OpenPose3D** category.

> **ComfyUI Manager**: You can also install via ComfyUI Manager by searching for "OpenPose3D".

### Node Inputs / Outputs

#### Inputs

| Parameter | Type | Default | Description |
|---|---|---|---|
| `width` | INT | 512 | Output image/mask width in pixels |
| `height` | INT | 768 | Output image/mask height in pixels |
| `pose_data` | STRING | *(empty)* | Scene JSON (managed by the editor widget) |
| `camera_distance` | FLOAT | 3.5 | Distance of the virtual camera from the scene origin |
| `camera_fov` | FLOAT | 45.0 | Camera field-of-view in degrees |
| `mask_width` | INT | 40 | Stroke thickness (px) used to draw skeleton connections when building the mask silhouette — larger = wider body area covered |
| `include_face_mask` | BOOL | True | Include 68-pt face landmarks in the mask outline |
| `include_hands_mask` | BOOL | True | Include hand landmarks in the mask outline |
| `mask_blur` | FLOAT | 0.0 | Gaussian blur radius for mask edges — 0 = hard binary, >0 = soft feathered |

#### Outputs

| Output | Type | Description |
|---|---|---|
| `pose_image` | IMAGE | RGB OpenPose skeleton image for ControlNet |
| `combined_mask` | MASK | Binary silhouette of all characters combined — standard ComfyUI `MASK` tensor `[1, H, W]`, values 0–1 |
| `mask_collection` | FREEFUSE_MASKS | Per-character masks in FreeFuse format: `{"masks": {"Character Name": Tensor(H, W), ...}}` — compatible with [FreeFuse](https://github.com/yaoliliu/FreeFuse) `FreeFuseMaskApplicator` |

### Mask Generation

Each character's skeleton is rendered as a thick white silhouette on a black canvas:

1. All skeleton bone connections are drawn as thick white lines (`mask_width` controls thickness)
2. Each joint is drawn as a filled circle (radius = `mask_width / 2`) for smooth, rounded joints
3. Per-character masks are stored separately in `mask_collection`
4. `combined_mask` is the pixel-wise maximum of all per-character masks

The masks are suitable for:
- **Region-of-interest guidance** — use as a soft spatial prior for inpainting or ControlNet
- **FreeFuse multi-concept composition** — feed `mask_collection` directly to `FreeFuseMaskApplicator` to assign each character a separate LoRA region

### Workflow

1. Add the **OpenPose3D Editor** node to your graph
2. Click the **📐 Open 3D Pose Editor** button inside the node
3. A full-screen 3D editor opens — adjust the pose by dragging keypoints
4. Click **✓ Send to ComfyUI** in the toolbar when done
5. The editor closes and the node thumbnail updates with your pose
6. Queue the workflow — the node renders the pose image and masks at the configured resolution
7. Connect `pose_image` → ControlNet `image` input
8. Connect `combined_mask` → any node that accepts a `MASK` (e.g. inpaint, latent noise mask)
9. Connect `mask_collection` → `FreeFuseMaskApplicator.masks` for multi-character LoRA composition

### Updating the pre-built editor

If you make changes to the frontend source, rebuild the ComfyUI-served app with:

```bash
npm run build:comfyui
```

This updates `web/app/` which ComfyUI serves as static files.

---

## Project Structure

```
src/
  main.js           Application entry — UI, event wiring, character management, ComfyUI mode
  scene3d.js        Three.js 3D scene, camera, lights, drag interaction
  renderer2d.js     2D canvas renderer — projects 3D pose to flat ControlNet output
  character.js      Character class — keypoints, mesh building, JSON serialization
  styles.css        Dark-theme UI styles
  skeleton/
    body.js         BODY_25 & COCO-18 keypoint definitions and default pose
    face.js         68-point facial landmark definitions and default pose
    hands.js        21-point hand landmark definitions and default pose
web/
  js/
    openpose3d.js   ComfyUI frontend widget (registers node, iframe dialog, postMessage bridge)
  app/              Pre-built Vite app served as static files by ComfyUI
__init__.py         ComfyUI entry point (WEB_DIRECTORY, NODE_CLASS_MAPPINGS)
nodes.py            OpenPose3DEditor ComfyUI node class
renderer.py         Python PIL skeleton renderer (mirrors renderer2d.js projection)
requirements.txt    Python dependencies (Pillow, numpy, torch)
index.html          Standalone app entry HTML
vite.config.js      Vite build config → dist/
vite.comfyui.config.js  Vite build config → web/app/
```

## ControlNet Compatibility

The output image is a standard OpenPose skeleton suitable for:
- **ControlNet OpenPose** (SDXL and SD 1.5) — body skeleton
- **ControlNet OpenPose_face** — body + face landmarks
- **ControlNet OpenPose_hand** — body + hand landmarks
- **ControlNet OpenPose_faceonly** — face landmarks only
- **ControlNet OpenPose_full** — full body, face, and hands

Choose BODY_25 format for maximum keypoint coverage including detailed foot control.
