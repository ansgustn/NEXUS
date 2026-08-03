# RVC Trained Voice Models Directory

Place your trained RVC model (`.pth`) and feature index (`.index`) files in this directory for historical figure voice conversion.

## Naming Convention

- **King Sejong (세종대왕)**:
  - Model file: `king-sejong.pth`
  - Index file: `king-sejong.index`

- **Yi Sun-sin (이순신)**:
  - Model file: `yi-sun-sin.pth`
  - Index file: `yi-sun-sin.index`

- **Kim Gu (백범 김구)**:
  - Model file: `kim-gu.pth`
  - Index file: `kim-gu.index`

## How it works

When `server/scripts/rvc_inference.py` runs, it checks for `server/models/rvc/<figure_id>.pth`.
If the `.pth` file exists, RVC voice conversion transforms the guide voice to the historical figure's voice.
If it is not yet present, the system safely falls back to the 1st guide audio without breaking.
