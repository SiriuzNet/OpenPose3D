# OpenPose3D

**OpenPose3D** is a 3D OpenPose skeleton editor for generating pose control images compatible with [ControlNet SDXL](https://huggingface.co/docs/diffusers/using-diffusers/controlnet). It is inspired by [open-pose-editor](https://github.com/ZhUyU1997/open-pose-editor) and [ComfyUI-openpose-editor](https://github.com/huchenlei/ComfyUI-openpose-editor), extending them with full 3D editing, adjustable marker sizes, and foot/hand detail.

![OpenPose3D Editor Screenshot](https://github.com/user-attachments/assets/13ae18d2-723e-4e00-a58d-6fb18870461d)

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

## Getting Started

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

## Usage

1. **Add a character** with the toolbar button (or `Ctrl+N`)
2. **Drag keypoints** in the 3D viewport to adjust the pose
3. **Orbit** the camera with left-drag, **pan** with right-drag, **zoom** with scroll
4. Adjust **marker sizes** and **colors** in the Settings panel
5. Toggle **face / hands / body** visibility per character in the Parts Visibility panel
6. Click **Export PNG** (or `Ctrl+E`) to download the ControlNet-ready skeleton image

## Project Structure

```
src/
  main.js           Application entry — UI, event wiring, character management
  scene3d.js        Three.js 3D scene, camera, lights, drag interaction
  renderer2d.js     2D canvas renderer — projects 3D pose to flat ControlNet output
  character.js      Character class — keypoints, mesh building, JSON serialization
  styles.css        Dark-theme UI styles
  skeleton/
    body.js         BODY_25 & COCO-18 keypoint definitions and default pose
    face.js         68-point facial landmark definitions and default pose
    hands.js        21-point hand landmark definitions and default pose
index.html          Entry HTML
vite.config.js      Vite build configuration
```

## ControlNet Compatibility

The 2D export produces a standard OpenPose skeleton image suitable for:
- **ControlNet OpenPose** (SDXL and SD 1.5) — body skeleton
- **ControlNet OpenPose_face** — body + face landmarks
- **ControlNet OpenPose_hand** — body + hand landmarks
- **ControlNet OpenPose_faceonly** — face landmarks only
- **ControlNet OpenPose_full** — full body, face, and hands

Choose BODY_25 format for maximum keypoint coverage including detailed foot control.
