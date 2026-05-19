# bmp.forge — 800×480 @ 235 DPI BMP Converter

Self-hosted JPEG → BMP converter for the Raspberry Pi 5. Drag in JPEGs, get
24-bit BMPs sized to **800 × 480** with **235 DPI** stamped in the header.
Aspect ratio is preserved by letterboxing on black.

## Files
```
bmp-converter/
├── app.py                 # Flask backend
├── requirements.txt
├── static/
│   ├── style.css
│   └── app.js
└── templates/
    └── index.html
```

## Setup on the Pi (one-time)

```bash
# 1. Copy the whole bmp-converter/ folder to your Pi (e.g. via scp)
cd ~/bmp-converter

# 2. Make a venv and install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run it

```bash
source .venv/bin/activate
python app.py
```

Then hit it from any device on your LAN:
```
http://<pi-ip>:5000
```
Find the Pi's IP with `hostname -I`.

## Run it on boot (systemd)

Create `/etc/systemd/system/bmpforge.service`:

```ini
[Unit]
Description=bmp.forge JPEG to BMP converter
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/bmp-converter
ExecStart=/home/pi/bmp-converter/.venv/bin/python /home/pi/bmp-converter/app.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bmpforge
sudo systemctl status bmpforge
```

## Limits
- 200 MB total per upload (tweak `MAX_CONTENT_LENGTH` in `app.py`)
- Extensions accepted: `.jpg .jpeg .jpe .jfif`
- Single file → returns the `.bmp`. Multiple files → returns a `.zip`.

## For production (optional)
Stick gunicorn in front for better concurrency:
```bash
pip install gunicorn
gunicorn -w 3 -b 0.0.0.0:5000 app:app
```
