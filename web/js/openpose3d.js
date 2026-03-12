/**
 * OpenPose3D ComfyUI frontend extension.
 *
 * Registers a custom widget for the "OpenPose3DEditor" node that:
 * - Shows a thumbnail preview of the current pose.
 * - Opens a full-screen 3D editor (embedded in an iframe) when clicked.
 * - Sends the completed pose back via postMessage, which becomes the
 *   node's `pose_data` STRING input value.
 */

import { app } from "../../../scripts/app.js";

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Derive the URL of the pre-built editor app from this script's URL.
 * ComfyUI serves web/ files at /extensions/<node-folder-name>/
 * e.g., this file lives at /extensions/OpenPose3D/js/openpose3d.js
 *       and the app is at  /extensions/OpenPose3D/app/index.html
 */
function getEditorBaseUrl() {
  const here = new URL(import.meta.url);
  const path = here.pathname;
  const jsIdx = path.lastIndexOf("/js/");
  if (jsIdx === -1) return "/extensions/OpenPose3D/";
  return here.origin + path.slice(0, jsIdx) + "/";
}

const EDITOR_BASE = getEditorBaseUrl();
const EDITOR_URL  = EDITOR_BASE + "app/index.html?comfyui=true";

// ── Thumbnail helpers ─────────────────────────────────────────────────────────

function drawPlaceholder(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0d0d1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Simple skeleton silhouette hint
  ctx.strokeStyle = "#2a2a4a";
  ctx.lineWidth = 1;
  // body line
  ctx.beginPath();
  ctx.moveTo(100, 30); ctx.lineTo(100, 90);
  ctx.moveTo(100, 90); ctx.lineTo(120, 150);
  ctx.moveTo(100, 90); ctx.lineTo(80, 150);
  // arms
  ctx.moveTo(100, 50); ctx.lineTo(140, 80);
  ctx.moveTo(100, 50); ctx.lineTo(60, 80);
  ctx.stroke();

  // Head circle
  ctx.beginPath();
  ctx.arc(100, 22, 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#3a3a6a";
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Click to open 3D Editor", 100, 175);
}

function drawPreview(canvas, dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Maintain aspect ratio
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      const dx = (canvas.width - sw) / 2;
      const dy = (canvas.height - sh) / 2;
      ctx.drawImage(img, dx, dy, sw, sh);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataURL;
  });
}

// ── ComfyUI extension ─────────────────────────────────────────────────────────

app.registerExtension({
  name: "OpenPose3D.PoseEditor",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "OpenPose3DEditor") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;

    nodeType.prototype.onNodeCreated = function () {
      const r = origOnNodeCreated?.apply(this, arguments);
      const node = this;

      // ── Find / hide the raw pose_data string widget ──────────────────────────
      const poseWidget = this.widgets?.find((w) => w.name === "pose_data");
      const widthWidget = this.widgets?.find((w) => w.name === "width");
      const heightWidget = this.widgets?.find((w) => w.name === "height");
      if (poseWidget) {
        // Collapse the raw string widget to zero height so it's invisible
        // but still serialised with the workflow.
        const origDraw = poseWidget.draw;
        poseWidget.draw = () => {};
        poseWidget.computeSize = () => [node.size?.[0] ?? 300, 0];
        poseWidget._hidden = true;
      }

      // ── Build the DOM container for the custom widget ─────────────────────
      const container = document.createElement("div");
      container.style.cssText =
        "width:100%;display:flex;flex-direction:column;gap:4px;padding:4px 0;font-family:Arial,sans-serif;";

      // Thumbnail canvas
      const THUMB_W = 200;
      const THUMB_H = 200;
      const thumbnail = document.createElement("canvas");
      thumbnail.width  = THUMB_W;
      thumbnail.height = THUMB_H;
      thumbnail.style.cssText =
        "display:block;width:100%;background:#0d0d1a;border:1px solid #2a2a4a;" +
        "border-radius:4px;cursor:pointer;";
      drawPlaceholder(thumbnail);

      // Open editor button
      const openBtn = document.createElement("button");
      openBtn.textContent = "📐 Open 3D Pose Editor";
      openBtn.style.cssText =
        "width:100%;padding:5px 8px;background:#1a1a3a;color:#8899ff;" +
        "border:1px solid #2a2a5a;border-radius:4px;cursor:pointer;font-size:12px;" +
        "transition:background 0.15s;";
      openBtn.onmouseenter = () => (openBtn.style.background = "#2a2a5a");
      openBtn.onmouseleave = () => (openBtn.style.background = "#1a1a3a");

      container.appendChild(thumbnail);
      container.appendChild(openBtn);

      // ── Add DOM widget ───────────────────────────────────────────────────────
      const domWidget = this.addDOMWidget(
        "pose_editor_ui",
        "openpose3d_widget",
        container,
        {
          getValue() {
            return poseWidget?.value ?? "";
          },
          setValue(v) {
            if (poseWidget) poseWidget.value = v;
            _updateThumbnail(v);
          },
          serialize: false, // pose_data widget handles serialisation
        }
      );

      // Keep the widget tall enough to show the thumbnail
      domWidget.computeSize = () => [node.size?.[0] ?? 300, THUMB_H + 36];

      // ── Thumbnail update ─────────────────────────────────────────────────────
      function _updateThumbnail(poseJson) {
        if (!poseJson) return;
        try {
          const data = JSON.parse(poseJson);
          if (data._preview) {
            drawPreview(thumbnail, data._preview);
          }
        } catch (_) {}
      }

      // Restore thumbnail if widget already has a value (workflow reload)
      if (poseWidget?.value) {
        _updateThumbnail(poseWidget.value);
      }

      // ── Editor dialog ────────────────────────────────────────────────────────
      function openEditor() {
        // Full-screen overlay
        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;" +
          "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
          "gap:8px;";

        // Header bar
        const header = document.createElement("div");
        header.style.cssText =
          "width:92%;max-width:1400px;display:flex;align-items:center;justify-content:space-between;" +
          "color:#dde0ff;font-family:Arial,sans-serif;";
        header.innerHTML =
          "<span style='font-size:16px;font-weight:bold;letter-spacing:0.04em'>" +
          "📐 OpenPose3D Editor — drag to pose · click ✓ Send to ComfyUI when done</span>";

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕ Close";
        closeBtn.style.cssText =
          "padding:5px 14px;background:#3a1a1a;color:#ff8888;border:1px solid #5a2a2a;" +
          "border-radius:4px;cursor:pointer;font-size:12px;";
        closeBtn.onclick = () => {
          overlay.remove();
          window.removeEventListener("message", onMessage);
        };
        header.appendChild(closeBtn);

        // iframe
        const iframe = document.createElement("iframe");
        iframe.style.cssText =
          "width:92%;max-width:1400px;height:82vh;border:1px solid #2a2a4a;" +
          "border-radius:6px;background:#0d0d1a;";
        iframe.src = EDITOR_URL;
        iframe.allow = "cross-origin-isolated";

        overlay.appendChild(header);
        overlay.appendChild(iframe);
        document.body.appendChild(overlay);

        // ── Send current scene to the newly loaded iframe ──────────────────────
        const currentPose = poseWidget?.value ?? "";

        iframe.addEventListener("load", () => {
          // Always send node dimensions so editor output matches
          const nodeW = widthWidget?.value ?? 512;
          const nodeH = heightWidget?.value ?? 768;

          if (currentPose) {
            try {
              const sceneObj = JSON.parse(currentPose);
              sceneObj._preview = undefined; // strip before sending
              iframe.contentWindow?.postMessage(
                { type: "openpose3d:load", scene: sceneObj, nodeWidth: nodeW, nodeHeight: nodeH },
                "*"
              );
            } catch (_) {}
          } else {
            // No saved pose yet — still sync output dimensions
            iframe.contentWindow?.postMessage(
              { type: "openpose3d:setSize", width: nodeW, height: nodeH },
              "*"
            );
          }
        });

        // ── Receive completed pose from the iframe ─────────────────────────────
        function onMessage(event) {
          if (!event.data) return;

          if (event.data.type === "openpose3d:ready") {
            // Editor signalled it's ready; send current pose if any
            const nodeW = widthWidget?.value ?? 512;
            const nodeH = heightWidget?.value ?? 768;

            if (currentPose) {
              try {
                const sceneObj = JSON.parse(currentPose);
                sceneObj._preview = undefined;
                iframe.contentWindow?.postMessage(
                  { type: "openpose3d:load", scene: sceneObj, nodeWidth: nodeW, nodeHeight: nodeH },
                  "*"
                );
              } catch (_) {}
            } else {
              iframe.contentWindow?.postMessage(
                { type: "openpose3d:setSize", width: nodeW, height: nodeH },
                "*"
              );
            }
          }

          if (event.data.type === "openpose3d:apply") {
            const sceneData   = event.data.scene   ?? {};
            const previewData = event.data.preview ?? null;

            // Sync editor output dimensions back to node width/height widgets
            if (sceneData.settings) {
              if (widthWidget && sceneData.settings.outputWidth)
                widthWidget.value = sceneData.settings.outputWidth;
              if (heightWidget && sceneData.settings.outputHeight)
                heightWidget.value = sceneData.settings.outputHeight;
            }

            // Build the pose JSON value stored in the node widget
            const poseJson = JSON.stringify({
              ...sceneData,
              _preview: previewData ?? undefined,
            });

            if (poseWidget) poseWidget.value = poseJson;
            _updateThumbnail(poseJson);

            // Close the dialog
            overlay.remove();
            window.removeEventListener("message", onMessage);

            // Notify ComfyUI that the graph needs saving
            app.graph.setDirtyCanvas(true, true);
          }
        }

        window.addEventListener("message", onMessage);

        // Auto-remove listener if overlay is closed via the close button
        const observer = new MutationObserver(() => {
          if (!document.body.contains(overlay)) {
            window.removeEventListener("message", onMessage);
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true });
      }

      openBtn.addEventListener("click", openEditor);
      thumbnail.addEventListener("click", openEditor);

      return r;
    };
  },
});
