"""
OpenPose3D - ComfyUI Custom Node
3D OpenPose skeleton editor with body (BODY_25/COCO-18), face (68pt),
and hand (21pt) support for ControlNet SDXL pose control.
"""
import os
import shutil

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Tell ComfyUI to serve files from the web/ directory.
# JS files in web/js/ are auto-loaded; the pre-built editor app is in web/app/.
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

# ── Startup housekeeping ──────────────────────────────────────────────────────

_node_dir = os.path.dirname(os.path.realpath(__file__))


def _cleanup_old_extension():
    """Remove any legacy extension folder if present."""
    try:
        import __main__
        main_dir = os.path.dirname(os.path.realpath(__main__.__file__))
        old_ext = os.path.join(main_dir, "web", "extensions", "OpenPose3D")
        if os.path.isdir(old_ext):
            shutil.rmtree(old_ext)
            print("\033[34mOpenPose3D:\033[0m Removed legacy extension folder")
    except Exception:
        pass


_cleanup_old_extension()

print("\033[34mOpenPose3D:\033[92m Loaded ✓\033[0m")
