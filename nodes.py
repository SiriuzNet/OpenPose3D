"""
OpenPose3DEditor ComfyUI node.
Accepts pose JSON from the web editor widget and renders it to an IMAGE tensor.
"""
import hashlib
import json
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn.functional as F

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
                "mask_occlusion": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "When enabled, characters that are further from the camera "
                        "are completely occluded by characters in front of them "
                        "(depth-based occlusion). "
                        "When disabled, masks are blended using the union (maximum) method."
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
        mask_occlusion:     bool  = False,
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

            if mask_occlusion:
                # Sort characters by distance from camera (closest first → in front)
                cam_pos_arr = np.array(cam_pos or [0, 0, camera_distance], dtype=np.float64)

                def _char_dist(char):
                    off = char.get("offset", [0.0, 0.0, 0.0])
                    return float(np.linalg.norm(np.array(off, dtype=np.float64) - cam_pos_arr))

                sorted_chars = sorted(
                    enumerate(characters),
                    key=lambda x: _char_dist(x[1]),
                )

                # Accumulated mask of all characters closer to the camera
                occluder = np.zeros((height, width), dtype=np.float32)

                for orig_idx, char in sorted_chars:
                    name    = char.get("name") or f"character_{orig_idx + 1}"
                    mask_np = render_mask_single(
                        char, width, height,
                        mask_width, camera_distance, cam_fov,
                        include_face_mask, include_hands_mask, mask_blur,
                        camera_pos=cam_pos, camera_target=cam_target,
                    )
                    # Hide the parts of this mask that are covered by closer characters
                    mask_occluded = mask_np * np.clip(1.0 - occluder, 0.0, 1.0)
                    per_char[name] = torch.from_numpy(mask_occluded)
                    combined  = np.maximum(combined, mask_occluded)
                    occluder  = np.maximum(occluder, mask_np)
            else:
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
        mask_occlusion:     bool  = False,
        **_kwargs,
    ):
        """Hash of pose JSON + mask parameters so ComfyUI re-runs when any changes."""
        if not pose_data:
            return ""
        clean = _strip_preview(pose_data)
        key   = f"{clean}|mw={mask_width}|f={include_face_mask}|h={include_hands_mask}|b={mask_blur}|occ={mask_occlusion}"
        return hashlib.sha256(key.encode("utf-8", errors="replace")).hexdigest()


class OpenPose3DMaskAdapter:
    """
    Inject per-character OpenPose3D pose masks into a FreeFuse mask bank.

    The OpenPose3D Editor outputs a ``mask_collection`` (FREEFUSE_MASKS) keyed
    by character names (e.g. "Character 1").  FreeFuse, however, needs masks
    keyed by **adapter names** (e.g. "subject_1") that it knows about internally.

    This node acts as the bridge:
      1. It reads the ordered adapter names from ``freefuse_data`` (preferred)
         or from ``mask_bank.metadata.adapter_names``.
      2. It matches each OpenPose character to a FreeFuse adapter slot by
         *exact name* first, then *positional order* for any remaining pairs.
      3. It replaces (or creates) each matched slot in ``mask_bank`` with the
         corresponding pose-shaped mask, resizing if required.

    Keep this as a **separate node** from the editor to avoid graph cycles in
    ComfyUI — the editor must not depend on its own mask output.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask_bank": ("FREEFUSE_MASKS",),
                "pose_masks": ("FREEFUSE_MASKS",),
            },
            "optional": {
                "freefuse_data": ("FREEFUSE_DATA",),
            },
        }

    RETURN_TYPES  = ("FREEFUSE_MASKS",)
    RETURN_NAMES  = ("mask_bank",)
    FUNCTION      = "inject_pose_masks"
    CATEGORY      = "OpenPose3D"
    DESCRIPTION   = (
        "Injects per-character OpenPose3D pose masks into a FreeFuse mask bank.\n"
        "• Connect mask_collection (OpenPose3D Editor) → pose_masks.\n"
        "• Connect FREEFUSE_MASKS from your FreeFuse pipeline → mask_bank.\n"
        "• Adapter slots are matched by name first, then by position.\n"
        "• Must be a separate node from the editor to avoid graph cycles."
    )

    # ── Internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _ordered_adapter_names(
        mask_bank: dict,
        freefuse_data: Optional[dict],
    ) -> List[str]:
        """Return adapter names in the canonical FreeFuse order."""
        names: List[str] = []
        seen: set = set()

        # Priority 1 — explicit adapter list from freefuse_data
        if isinstance(freefuse_data, dict):
            for adapter in freefuse_data.get("adapters", []):
                name = adapter.get("name") if isinstance(adapter, dict) else adapter
                if isinstance(name, str) and name not in seen:
                    names.append(name)
                    seen.add(name)

        # Priority 2 — metadata inside the mask bank itself
        metadata = mask_bank.get("metadata", {})
        if isinstance(metadata, dict):
            for name in metadata.get("adapter_names", []):
                if isinstance(name, str) and name not in seen:
                    names.append(name)
                    seen.add(name)

        # Priority 3 — whatever keys already exist in the bank
        for name in (mask_bank.get("masks") or {}).keys():
            if name not in seen:
                names.append(name)
                seen.add(name)

        return names

    @staticmethod
    def _to_2d(t: torch.Tensor) -> Optional[torch.Tensor]:
        """Normalise any mask tensor to a plain 2-D float32 [H, W]."""
        if not isinstance(t, torch.Tensor):
            return None
        if t.dim() == 2:
            return t.float()
        if t.dim() == 3:
            return t[0].float()
        if t.dim() == 4:
            return t[0, 0].float()
        print(
            f"\033[33m[OpenPose3DMaskAdapter]\033[0m Unsupported mask tensor "
            f"with {t.dim()} dimensions — expected 2, 3, or 4."
        )
        return None

    @staticmethod
    def _resize_2d(src: torch.Tensor, h: int, w: int) -> torch.Tensor:
        if src.shape[0] == h and src.shape[1] == w:
            return src
        return F.interpolate(
            src.unsqueeze(0).unsqueeze(0),
            size=(h, w),
            mode="bilinear",
            align_corners=False,
        ).squeeze(0).squeeze(0)

    @classmethod
    def _format_like(
        cls,
        pose_2d: torch.Tensor,
        existing: Optional[torch.Tensor],
    ) -> torch.Tensor:
        """Resize pose_2d to match *existing* H/W and copy its dimensionality."""
        result = pose_2d
        if isinstance(existing, torch.Tensor):
            ref = cls._to_2d(existing)
            if ref is not None:
                result = cls._resize_2d(result, ref.shape[0], ref.shape[1])
            result = result.to(device=existing.device, dtype=torch.float32)
            if existing.dim() == 3:
                return result.unsqueeze(0)
            if existing.dim() == 4:
                return result.unsqueeze(0).unsqueeze(0)
        return result

    # ── Main execute ──────────────────────────────────────────────────────────

    def inject_pose_masks(
        self,
        mask_bank,
        pose_masks,
        freefuse_data=None,
    ):
        # Graceful fallbacks for unexpected input types
        if not isinstance(mask_bank, dict):
            mask_bank = {"masks": {}}
        if not isinstance(pose_masks, dict):
            return (mask_bank,)

        pose_dict: Dict[str, torch.Tensor] = pose_masks.get("masks") or {}
        if not pose_dict:
            return (mask_bank,)

        adapter_names = self._ordered_adapter_names(mask_bank, freefuse_data)
        original_masks: Dict[str, torch.Tensor] = dict(mask_bank.get("masks") or {})

        # Build ordered pose items (preserve insertion order)
        pose_items = list(pose_dict.items())

        assigned: Dict[str, torch.Tensor] = {}   # adapter_name → 2-D pose mask
        pose_used = [False] * len(pose_items)

        # ── Pass 1: exact name match (case-insensitive) ───────────────────────
        adapter_lower = {a.lower(): a for a in adapter_names}
        for pi, (char_name, char_tensor) in enumerate(pose_items):
            canonical = adapter_lower.get(char_name.lower())
            if canonical is not None and canonical not in assigned:
                m2d = self._to_2d(char_tensor)
                if m2d is not None:
                    assigned[canonical] = m2d
                    pose_used[pi] = True

        # ── Pass 2: positional assignment for leftover pairs ──────────────────
        unmatched_adapters = [a for a in adapter_names if a not in assigned]
        unmatched_poses = [
            (n, t) for (n, t), used in zip(pose_items, pose_used) if not used
        ]
        for adapter_name, (_, char_tensor) in zip(unmatched_adapters, unmatched_poses):
            m2d = self._to_2d(char_tensor)
            if m2d is not None:
                assigned[adapter_name] = m2d

        # ── Merge into mask bank ──────────────────────────────────────────────
        new_masks = dict(original_masks)
        for adapter_name, pose_2d in assigned.items():
            new_masks[adapter_name] = self._format_like(
                pose_2d, original_masks.get(adapter_name)
            )

        new_bank = dict(mask_bank)
        new_bank["masks"] = new_masks
        return (new_bank,)


class OpenPose3DBackgroundMask:
    """
    Generate a background mask (and optionally a blue-tinted background image)
    from the combined pose mask produced by the OpenPose3D Editor.

    The background mask is the logical inverse of the combined character mask:
    pixels that do NOT belong to any character skeleton are 1.0 (white),
    and character pixels are 0.0 (black).

    When *color_blue* is enabled the node also outputs an IMAGE where the
    background region is painted solid blue (like FreeFuse's background layer),
    making it easy to use as a coloured matte or a blue-screen compositing layer.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "combined_mask": ("MASK",),
            },
            "optional": {
                "color_blue": ("BOOLEAN", {
                    "default": False,
                    "tooltip": (
                        "When enabled, the background region is painted solid blue "
                        "(RGB 0,0,255) in the output image, matching the FreeFuse "
                        "background-layer convention. "
                        "When disabled, the background image is plain white."
                    ),
                }),
            },
        }

    RETURN_TYPES  = ("MASK", "IMAGE")
    RETURN_NAMES  = ("background_mask", "background_image")
    FUNCTION      = "generate"
    CATEGORY      = "OpenPose3D"
    DESCRIPTION   = (
        "Inverts the combined pose mask to produce a background mask.\n"
        "• background_mask  — Binary mask: 1=background, 0=characters (ComfyUI MASK)\n"
        "• background_image — Visualisation: white background, or solid-blue when "
        "color_blue is enabled (FreeFuse-style blue matte)"
    )

    def generate(
        self,
        combined_mask,
        color_blue: bool = False,
    ):
        # Normalise combined_mask to a 2-D float32 [H, W] tensor.
        # Fall back to a minimal 8×8 black tensor if the input is not a Tensor
        # (e.g. when the node is used with a default/unconnected input).
        if not isinstance(combined_mask, torch.Tensor):
            combined_mask = torch.zeros(1, 8, 8)

        m = combined_mask
        if m.dim() == 3:
            m = m[0]          # [1, H, W] → [H, W]
        elif m.dim() == 4:
            m = m[0, 0]       # [1, 1, H, W] → [H, W]

        h, w = m.shape

        # Background mask = inverse of character mask
        bg_mask = torch.clamp(1.0 - m, 0.0, 1.0)           # [H, W]
        bg_mask_out = bg_mask.unsqueeze(0)                   # [1, H, W]

        # Background image  [1, H, W, 3]
        img = torch.zeros(1, h, w, 3, dtype=torch.float32)
        if color_blue:
            # Blue channel = background region (FreeFuse style)
            img[0, :, :, 2] = bg_mask        # R=0, G=0, B=bg
        else:
            # Plain white background image
            img[0, :, :, 0] = bg_mask        # R=bg
            img[0, :, :, 1] = bg_mask        # G=bg
            img[0, :, :, 2] = bg_mask        # B=bg

        return (bg_mask_out, img)


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
    "OpenPose3DEditor":           OpenPose3DEditor,
    "OpenPose3DMaskAdapter":      OpenPose3DMaskAdapter,
    "OpenPose3DBackgroundMask":   OpenPose3DBackgroundMask,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "OpenPose3DEditor":           "OpenPose3D Editor",
    "OpenPose3DMaskAdapter":      "OpenPose3D Mask Adapter",
    "OpenPose3DBackgroundMask":   "OpenPose3D Background Mask",
}
