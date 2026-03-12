"""
OpenPose3DEditor ComfyUI node.
Accepts pose JSON from the web editor widget and renders it to an IMAGE tensor.
"""
import hashlib
import json

import numpy as np
import torch

from .renderer import render_scene, render_mask_single


class OpenPose3DEditor:
    """
    3D OpenPose Editor node.

    Use the embedded 3D editor widget to position body, face, and hand
    skeletons. The node renders the pose to a ControlNet-compatible image
    and also generates spatial masks compatible with FreeFuse.

    Outputs:
        pose_image      (IMAGE):          RGB OpenPose skeleton image for ControlNet.
        combined_mask   (MASK):           All-character binary silhouette mask [1, H, W].
        mask_collection (FREEFUSE_MASKS): Per-character masks {"masks": {name: Tensor(H,W)}}.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": ("INT", {
                    "default": 512, "min": 64, "max": 2048, "step": 64,
                    "display": "number",
                }),
                "height": ("INT", {
                    "default": 768, "min": 64, "max": 2048, "step": 64,
                    "display": "number",
                }),
            },
            "optional": {
                "pose_data": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Scene JSON from the OpenPose3D Editor widget",
                }),
                "camera_distance": ("FLOAT", {
                    "default": 3.5, "min": 0.5, "max": 20.0, "step": 0.1,
                }),
                "camera_fov": ("FLOAT", {
                    "default": 45.0, "min": 10.0, "max": 120.0, "step": 1.0,
                }),
                # ── Mask generation ──────────────────────────────────────────
                "mask_width": ("INT", {
                    "default": 40, "min": 1, "max": 300, "step": 1,
                    "tooltip": (
                        "Stroke thickness (pixels) used to draw each skeleton "
                        "connection when building the mask silhouette. "
                        "Larger = wider body area covered."
                    ),
                }),
                "include_face_mask": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Include 68-pt facial landmarks in the mask outline.",
                }),
                "include_hands_mask": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Include hand landmarks in the mask outline.",
                }),
                "mask_blur": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 40.0, "step": 0.5,
                    "tooltip": (
                        "Gaussian blur radius applied to each mask. "
                        "0 = hard binary edge; >0 = soft feathered edge."
                    ),
                }),
            },
        }

    RETURN_TYPES  = ("IMAGE", "MASK", "FREEFUSE_MASKS")
    RETURN_NAMES  = ("pose_image", "combined_mask", "mask_collection")
    FUNCTION      = "render"
    CATEGORY      = "OpenPose3D"
    DESCRIPTION   = (
        "Renders a 3D pose to a ControlNet pose image and generates spatial masks.\n"
        "• pose_image      — RGB OpenPose skeleton (ControlNet input)\n"
        "• combined_mask   — Binary silhouette of all characters (ComfyUI MASK)\n"
        "• mask_collection — Per-character masks (FREEFUSE_MASKS, compatible with FreeFuse)"
    )

    def render(
        self,
        width:              int   = 512,
        height:             int   = 768,
        pose_data:          str   = "",
        camera_distance:    float = 3.5,
        camera_fov:         float = 45.0,
        mask_width:         int   = 40,
        include_face_mask:  bool  = True,
        include_hands_mask: bool  = True,
        mask_blur:          float = 0.0,
    ):
        """Render pose JSON → pose image + masks."""
        clean_json  = _strip_preview(pose_data)
        empty_mask  = torch.zeros(1, height, width)
        empty_ff    = {"masks": {}}

        if not clean_json or not clean_json.strip():
            return (_empty_tensor(width, height), empty_mask, empty_ff)

        try:
            # ── Pose image ───────────────────────────────────────────────────
            pil_img = render_scene(clean_json, width, height, camera_distance, camera_fov)
            img_arr = np.array(pil_img).astype(np.float32) / 255.0
            pose_tensor = torch.from_numpy(img_arr)[None,]   # [1, H, W, C]

            # ── Masks ────────────────────────────────────────────────────────
            scene      = json.loads(clean_json)
            characters = scene.get("characters", [])

            # Extract camera state from scene (stored by the 3D editor)
            camera_data = scene.get("camera")
            cam_pos    = camera_data.get("position") if camera_data else None
            cam_target = camera_data.get("target")   if camera_data else None
            cam_fov    = camera_data.get("fov", camera_fov) if camera_data else camera_fov

            per_char: dict = {}
            combined  = np.zeros((height, width), dtype=np.float32)

            for i, char in enumerate(characters):
                name     = char.get("name") or f"character_{i + 1}"
                mask_np  = render_mask_single(
                    char, width, height,
                    mask_width, camera_distance, cam_fov,
                    include_face_mask, include_hands_mask, mask_blur,
                    camera_pos=cam_pos, camera_target=cam_target,
                )
                # FREEFUSE_MASKS value: Tensor(H, W)
                per_char[name] = torch.from_numpy(mask_np)
                combined = np.maximum(combined, mask_np)

            # ComfyUI MASK: Tensor(1, H, W)
            combined_mask = torch.from_numpy(combined).unsqueeze(0)
            freefuse_masks = {"masks": per_char}

            return (pose_tensor, combined_mask, freefuse_masks)

        except Exception as exc:
            print(f"\033[33m[OpenPose3DEditor]\033[0m Render error: {exc}")
            return (_empty_tensor(width, height), empty_mask, empty_ff)

    @classmethod
    def IS_CHANGED(
        cls,
        pose_data:          str   = "",
        mask_width:         int   = 40,
        include_face_mask:  bool  = True,
        include_hands_mask: bool  = True,
        mask_blur:          float = 0.0,
        **_kwargs,
    ):
        """Hash of pose JSON + mask parameters so ComfyUI re-runs when any changes."""
        if not pose_data:
            return ""
        clean = _strip_preview(pose_data)
        key   = f"{clean}|mw={mask_width}|f={include_face_mask}|h={include_hands_mask}|b={mask_blur}"
        return hashlib.sha256(key.encode("utf-8", errors="replace")).hexdigest()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_preview(pose_data: str) -> str:
    """Remove the _preview base64 field to keep the stored JSON compact."""
    if not pose_data:
        return pose_data
    try:
        data = json.loads(pose_data)
        data.pop("_preview", None)
        return json.dumps(data)
    except (json.JSONDecodeError, TypeError):
        return pose_data


def _empty_tensor(width: int, height: int) -> torch.Tensor:
    """Return a black IMAGE tensor of the given dimensions."""
    arr = np.zeros((1, height, width, 3), dtype=np.float32)
    return torch.from_numpy(arr)


# ── ComfyUI registration ──────────────────────────────────────────────────────

NODE_CLASS_MAPPINGS = {
    "OpenPose3DEditor": OpenPose3DEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OpenPose3DEditor": "OpenPose3D Editor",
}
