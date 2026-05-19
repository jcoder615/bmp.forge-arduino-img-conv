#!/usr/bin/env python3
"""
JPEG -> 800x480 BMP @ 235 DPI converter
Backend for Raspberry Pi 5 (8GB)
"""
import io
import os
import zipfile
from pathlib import Path

from flask import Flask, render_template, request, send_file, jsonify, abort
from PIL import Image
from werkzeug.utils import secure_filename

# --- Config ---------------------------------------------------------------
TARGET_W = 800
TARGET_H = 480
TARGET_DPI = 235
MAX_FILE_SIZE = 25 * 1024 * 1024          # 25 MB per file
MAX_CONTENT_LENGTH = 200 * 1024 * 1024    # 200 MB total upload
ALLOWED_EXT = {"jpg", "jpeg", "jpe", "jfif"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


# --- Helpers --------------------------------------------------------------
def allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def convert_to_bmp(file_storage) -> tuple[str, bytes]:
    """
    Open uploaded JPEG, fit to 800x480 (letterbox on black),
    save as 24-bit BMP at 235 DPI.
    Returns (output_filename, bmp_bytes).
    """
    img = Image.open(file_storage.stream)

    # Respect EXIF orientation, then flatten to RGB on black
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    if img.mode != "RGB":
        img = img.convert("RGB")

    # Fit inside 800x480 preserving aspect ratio (letterbox on black)
    src_w, src_h = img.size
    scale = min(TARGET_W / src_w, TARGET_H / src_h)
    new_w = max(1, int(round(src_w * scale)))
    new_h = max(1, int(round(src_h * scale)))
    img = img.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (TARGET_W, TARGET_H), (0, 0, 0))
    canvas.paste(img, ((TARGET_W - new_w) // 2, (TARGET_H - new_h) // 2))

    out = io.BytesIO()
    canvas.save(out, format="BMP", dpi=(TARGET_DPI, TARGET_DPI))
    out.seek(0)

    base = Path(secure_filename(file_storage.filename or "image")).stem or "image"
    return f"{base}_800x480.bmp", out.getvalue()


# --- Routes ---------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/convert", methods=["POST"])
def convert():
    """
    Multi-file endpoint.
    - 1 file  -> returns the .bmp directly
    - N files -> returns a .zip of all .bmp results
    """
    files = request.files.getlist("files")
    if not files:
        return jsonify(error="No files uploaded"), 400

    # Validate
    cleaned = []
    for f in files:
        if not f or not f.filename:
            continue
        if not allowed(f.filename):
            return jsonify(error=f"Not a JPEG: {f.filename}"), 400
        cleaned.append(f)

    if not cleaned:
        return jsonify(error="No valid JPEGs uploaded"), 400

    try:
        results = [convert_to_bmp(f) for f in cleaned]
    except Exception as e:
        app.logger.exception("Conversion failed")
        return jsonify(error=f"Conversion failed: {e}"), 500

    if len(results) == 1:
        name, data = results[0]
        return send_file(
            io.BytesIO(data),
            mimetype="image/bmp",
            as_attachment=True,
            download_name=name,
        )

    # Zip multiple results
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in results:
            zf.writestr(name, data)
    zbuf.seek(0)
    return send_file(
        zbuf,
        mimetype="application/zip",
        as_attachment=True,
        download_name="converted_bmps.zip",
    )


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="Upload too large (200 MB total max)"), 413


if __name__ == "__main__":
    # Bind to all interfaces so other devices on your LAN can hit the Pi
    app.run(host="0.0.0.0", port=5000, debug=False)
