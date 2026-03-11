"""
OpenPose3DEditor ComfyUI node.
Accepts pose JSON from the web editor widget and renders it to an IMAGE tensor.
"""
import hashlib
import json

import numpy as np
import torch

from .renderer import render_scene


class OpenPose3DEditor:
    """
    3D OpenPose Editor node.

    Use the embedded 3D editor widget to position body, face, and hand
    skeletons. The node renders the pose to a ControlNet-compatible image.

    Outputs:
        pose_image (IMAGE): RGB OpenPose skeleton image ready for ControlNet.
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
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("pose_image",)
    FUNCTION = "render"
    CATEGORY = "OpenPose3D"
    DESCRIPTION = "Renders a 3D pose (edited in the embedded OpenPose3D editor) to a ControlNet pose image."

    def render(
        self,
        width: int = 512,
        height: int = 768,
        pose_data: str = "",
        camera_distance: float = 3.5,
        camera_fov: float = 45.0,
    ):
        """Render pose JSON to IMAGE tensor."""
        # Strip the internal _preview key before rendering
        clean_json = _strip_preview(pose_data)

        if not clean_json or not clean_json.strip():
            # No pose data → return black image
            return (_empty_tensor(width, height),)

        try:
            pil_img = render_scene(clean_json, width, height, camera_distance, camera_fov)
            img_arr = np.array(pil_img).astype(np.float32) / 255.0
            # ComfyUI expects [batch, H, W, C]
            tensor = torch.from_numpy(img_arr)[None,]
            return (tensor,)
        except Exception as exc:
            print(f"\033[33m[OpenPose3DEditor]\033[0m Render error: {exc}")
            return (_empty_tensor(width, height),)

    @classmethod
    def IS_CHANGED(cls, pose_data: str = "", **_kwargs):
        """Return a hash so ComfyUI re-runs the node only when pose changes."""
        if not pose_data:
            return ""
        clean = _strip_preview(pose_data)
        return hashlib.sha256(clean.encode("utf-8", errors="replace")).hexdigest()


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
