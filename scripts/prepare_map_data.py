#!/usr/bin/env python3.12
"""
Prepare map data for web deployment.
Crops the map image, converts route paths to pixel coords, exports compact JSON.
"""
import json
import os
import sys

# Calibration constants (pixel <-> OSRS)
CALIB_1_PX = (2165, 3350)
CALIB_1_RS = (1680, 3106)
CALIB_2_PX = (4750, 1450)
CALIB_2_RS = (2542, 3742)

SCALE_X = (CALIB_2_RS[0] - CALIB_1_RS[0]) / (CALIB_2_PX[0] - CALIB_1_PX[0])
OFFSET_X = CALIB_1_RS[0] - SCALE_X * CALIB_1_PX[0]
SCALE_Y = (CALIB_2_RS[1] - CALIB_1_RS[1]) / (CALIB_2_PX[1] - CALIB_1_PX[1])
OFFSET_Y = CALIB_1_RS[1] - SCALE_Y * CALIB_1_PX[1]

MARKER_COLORS = [
    "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c",
    "#3498db", "#9b59b6", "#e91e9f", "#ecf0f1", "#2c3e50",
]
MARKER_NAMES = [
    "Red", "Orange", "Yellow", "Green", "Teal",
    "Blue", "Purple", "Pink", "White", "Dark",
]
PHASE_COLORS = {0: "Red", 2: "Yellow", 3: "Green"}

CROP_PAD = 300


def osrs_to_pixel(rx, ry):
    px = (rx - OFFSET_X) / SCALE_X
    py = (ry - OFFSET_Y) / SCALE_Y
    return px, py


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    map_tool = os.path.join(base, "map_tool")
    public_dir = os.path.join(base, "public")
    src_data = os.path.join(base, "src", "data")

    markers_path = os.path.join(map_tool, "markers.json")
    routes_path = os.path.join(map_tool, "routes.json")
    map_path = os.path.expanduser("~/Downloads/Old_School_RuneScape_world_map.png")

    # Load markers
    with open(markers_path) as f:
        markers = json.load(f)
    print(f"Loaded {len(markers)} markers")

    # Compute bounding box of all markers
    xs = [m["x"] for m in markers]
    ys = [m["y"] for m in markers]
    min_x, max_x = min(xs) - CROP_PAD, max(xs) + CROP_PAD
    min_y, max_y = min(ys) - CROP_PAD, max(ys) + CROP_PAD

    # Clamp to image bounds
    min_x = max(0, int(min_x))
    min_y = max(0, int(min_y))
    max_x = int(max_x)
    max_y = int(max_y)

    print(f"Crop region: ({min_x}, {min_y}) -> ({max_x}, {max_y})")
    print(f"Crop size: {max_x - min_x} x {max_y - min_y}")

    # Crop map image
    from PIL import Image
    img = Image.open(map_path)
    max_x = min(max_x, img.width)
    max_y = min(max_y, img.height)
    cropped = img.crop((min_x, min_y, max_x, max_y))
    crop_path = os.path.join(public_dir, "map-cropped.jpg")
    cropped.save(crop_path, "JPEG", quality=85)
    crop_size = os.path.getsize(crop_path)
    print(f"Saved cropped map: {crop_path} ({crop_size / 1024 / 1024:.1f} MB)")

    # Adjust marker coords for crop
    web_markers = []
    for i, m in enumerate(markers):
        web_markers.append({
            "id": i,
            "x": m["x"] - min_x,
            "y": m["y"] - min_y,
            "color": m["color"],
            "text": m["text"],
            "completed": m.get("completed", False),
        })

    # Process routes
    web_routes = {}
    routes_data = {}
    if os.path.exists(routes_path):
        with open(routes_path) as f:
            routes_data = json.load(f)

    path_cache = routes_data.get("path_cache", {})
    solved_routes = routes_data.get("solved_routes", {})

    print(f"Path cache: {len(path_cache)} entries")
    print(f"Solved routes: {list(solved_routes.keys())}")

    for color_idx_str, visit_order in solved_routes.items():
        color_idx = int(color_idx_str)
        phase_markers = [m for i, m in enumerate(markers) if m["color"] == color_idx and not m.get("completed", False)]
        # Build index-to-global-id mapping (web marker IDs match position in full markers array)
        phase_marker_ids = [i for i, m in enumerate(markers) if m["color"] == color_idx and not m.get("completed", False)]

        if len(phase_markers) != len(visit_order):
            print(f"  Phase {color_idx}: marker count mismatch ({len(phase_markers)} vs {len(visit_order)} in order), skipping")
            continue

        # Convert visit_order from phase-local indices to global marker IDs
        visit_order_ids = [phase_marker_ids[idx] for idx in visit_order]

        segments = []
        for i in range(len(visit_order) - 1):
            m1 = phase_markers[visit_order[i]]
            m2 = phase_markers[visit_order[i + 1]]

            # Try to find path in cache
            rs1 = (
                int(round(m1["x"] * SCALE_X + OFFSET_X)),
                int(round(m1["y"] * SCALE_Y + OFFSET_Y)),
            )
            rs2 = (
                int(round(m2["x"] * SCALE_X + OFFSET_X)),
                int(round(m2["y"] * SCALE_Y + OFFSET_Y)),
            )

            # Build cache key (order-independent, matching map_viewer.py)
            k1 = rs1[0] * 100000 + rs1[1]
            k2 = rs2[0] * 100000 + rs2[1]
            cache_key = f"{min(k1,k2)}_{max(k1,k2)}"

            osrs_path = path_cache.get(cache_key)
            if osrs_path and len(osrs_path) > 1:
                # Convert OSRS coords to cropped pixel coords, subsample
                step = max(1, len(osrs_path) // 100)
                sampled = osrs_path[::step]
                if sampled[-1] != osrs_path[-1]:
                    sampled.append(osrs_path[-1])

                pixel_path = []
                for pt in sampled:
                    px, py = osrs_to_pixel(pt[0], pt[1])
                    pixel_path.append([round(px - min_x, 1), round(py - min_y, 1)])
                segments.append(pixel_path)
            else:
                # Fallback: straight line
                segments.append([
                    [round(m1["x"] - min_x, 1), round(m1["y"] - min_y, 1)],
                    [round(m2["x"] - min_x, 1), round(m2["y"] - min_y, 1)],
                ])

        web_routes[color_idx_str] = {
            "visitOrder": visit_order_ids,
            "segments": segments,
        }
        print(f"  Phase {color_idx} ({PHASE_COLORS.get(color_idx, '?')}): {len(visit_order)} stops, {len(segments)} segments")

    # Write output
    os.makedirs(src_data, exist_ok=True)

    map_data = {
        "cropOffset": {"x": min_x, "y": min_y},
        "cropSize": {"w": max_x - min_x, "h": max_y - min_y},
        "markers": web_markers,
        "routes": web_routes,
        "colors": MARKER_COLORS,
        "colorNames": MARKER_NAMES,
    }

    out_path = os.path.join(src_data, "map-data.json")
    with open(out_path, "w") as f:
        json.dump(map_data, f)
    out_size = os.path.getsize(out_path)
    print(f"Saved map data: {out_path} ({out_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
