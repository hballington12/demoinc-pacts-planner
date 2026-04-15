#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$DIR/.venv"

if [ ! -d "$VENV" ]; then
    python3.12 -m venv "$VENV"
    "$VENV/bin/pip" install Pillow
fi

"$VENV/bin/python" "$DIR/map_viewer.py" "$@"
