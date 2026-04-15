#!/usr/bin/env python3.12
"""
OSRS World Map Viewer with markers.
Pan with click-drag, zoom with scroll wheel, right-click to place markers.
"""

import tkinter as tk
from tkinter import simpledialog
from PIL import Image, ImageTk
import json
import math
import os
import random
import time

MAP_PATH = os.path.expanduser("~/Downloads/Old_School_RuneScape_world_map.png")
SAVE_PATH = os.path.join(os.path.dirname(__file__), "markers.json")
VIEW_PATH = os.path.join(os.path.dirname(__file__), "view_state.json")
ROUTES_PATH = os.path.join(os.path.dirname(__file__), "routes.json")

RSC_BASE = os.path.join(os.path.dirname(__file__), "..", "rsc", "shortest-path", "src", "main", "resources")
COLLISION_ZIP = os.path.join(RSC_BASE, "collision-map.zip")
TRANSPORTS_DIR = os.path.join(RSC_BASE, "transports")

# -- Pixel <-> OSRS coordinate calibration --
# Two known points: (pixel_x, pixel_y) -> (osrs_x, osrs_y)
# Add a second calibration point to complete the mapping.
CALIB_1_PX = (2165, 3350)
CALIB_1_RS = (1680, 3106)
CALIB_2_PX = (4750, 1450)
CALIB_2_RS = (2542, 3742)


def _init_calibration():
    """Compute scale and offset from two calibration points.
    Returns (scale_x, offset_x, scale_y, offset_y) where:
        osrs_x = pixel_x * scale_x + offset_x
        osrs_y = pixel_y * scale_y + offset_y
    """
    if CALIB_2_PX is None or CALIB_2_RS is None:
        return None
    sx = (CALIB_2_RS[0] - CALIB_1_RS[0]) / (CALIB_2_PX[0] - CALIB_1_PX[0])
    ox = CALIB_1_RS[0] - sx * CALIB_1_PX[0]
    sy = (CALIB_2_RS[1] - CALIB_1_RS[1]) / (CALIB_2_PX[1] - CALIB_1_PX[1])
    oy = CALIB_1_RS[1] - sy * CALIB_1_PX[1]
    return (sx, ox, sy, oy)


CALIBRATION = _init_calibration()


def px_to_rs(px_x: float, px_y: float) -> tuple[float, float] | None:
    """Convert pixel coords to OSRS coords. Returns None if not calibrated."""
    if CALIBRATION is None:
        return None
    sx, ox, sy, oy = CALIBRATION
    return (px_x * sx + ox, px_y * sy + oy)


def rs_to_px(rs_x: float, rs_y: float) -> tuple[float, float] | None:
    """Convert OSRS coords to pixel coords. Returns None if not calibrated."""
    if CALIBRATION is None:
        return None
    sx, ox, sy, oy = CALIBRATION
    return ((rs_x - ox) / sx, (rs_y - oy) / sy)
MAP_DIM = 0.55  # 0.0 = black, 1.0 = full brightness

MARKER_COLORS = [
    "#e74c3c",  # Red
    "#e67e22",  # Orange
    "#f1c40f",  # Yellow
    "#2ecc71",  # Green
    "#1abc9c",  # Teal
    "#3498db",  # Blue
    "#9b59b6",  # Purple
    "#e91e9f",  # Pink
    "#ecf0f1",  # White
    "#2c3e50",  # Dark
]

MARKER_NAMES = [
    "Red", "Orange", "Yellow", "Green", "Teal",
    "Blue", "Purple", "Pink", "White", "Dark",
]

MARKER_RADIUS = 8
MIN_ZOOM = 0.05
MAX_ZOOM = 3.0


class Marker:
    def __init__(self, map_x: float, map_y: float, color_idx: int, text: str, completed: bool = False):
        self.map_x = map_x
        self.map_y = map_y
        self.color_idx = color_idx
        self.text = text
        self.completed = completed

    def to_dict(self):
        return {
            "x": self.map_x,
            "y": self.map_y,
            "color": self.color_idx,
            "text": self.text,
            "completed": self.completed,
        }

    @staticmethod
    def from_dict(d):
        return Marker(d["x"], d["y"], d["color"], d["text"], d.get("completed", False))


# -- Shortcut connections (teleports / quick-travel) --
# Each group is a set of points where travel between any pair costs 0.
# 2-point group = direct link, 3-point group = triangle.
SHORTCUT_GROUPS: list[list[tuple[float, float]]] = [
    [(2224, 3256), (800, 3400)],
    [(2350, 3250), (1670, 3750), (5430, 3000)],
    [(2080, 3650), (1415, 2700), (1200, 3850)],
]

SHORTCUT_SNAP = 80  # How close a marker must be to a shortcut point to use it


def _near_shortcut_point(mx: float, my: float, px: float, py: float) -> bool:
    return (mx - px) ** 2 + (my - py) ** 2 <= SHORTCUT_SNAP ** 2


def _shortcut_cost(a: Marker, b: Marker) -> float | None:
    """If a and b are each near different points in the same shortcut group, return 0."""
    for group in SHORTCUT_GROUPS:
        a_near = [i for i, (px, py) in enumerate(group) if _near_shortcut_point(a.map_x, a.map_y, px, py)]
        b_near = [i for i, (px, py) in enumerate(group) if _near_shortcut_point(b.map_x, b.map_y, px, py)]
        if a_near and b_near and set(a_near) != set(b_near):
            return 25.0
    return None


# -- Pathfinder integration --

_pathfinder = None
_dist_cache: dict[tuple[int, int], float] = {}
_path_cache: dict[tuple[int, int], list[tuple[int, int]]] = {}

NUM_WORKERS = max(1, os.cpu_count() - 1)  # Leave 1 core for UI


def _load_pathfinder():
    global _pathfinder
    if _pathfinder is not None:
        return _pathfinder
    if os.path.exists(COLLISION_ZIP):
        from pathfinder import OsrsPathfinder
        _pathfinder = OsrsPathfinder(COLLISION_ZIP, TRANSPORTS_DIR)
    return _pathfinder


def _pixel_dist(a: Marker, b: Marker) -> float:
    dx = a.map_x - b.map_x
    dy = a.map_y - b.map_y
    return math.sqrt(dx * dx + dy * dy)


def _worker_init():
    """Each worker process loads its own pathfinder instance."""
    global _worker_pf
    from pathfinder import OsrsPathfinder
    _worker_pf = OsrsPathfinder(COLLISION_ZIP, TRANSPORTS_DIR)


def _worker_find_path(args: tuple) -> tuple[int, int | None, list[tuple[int, int]] | None]:
    """Worker function: compute path + cost for a single pair.
    Args: (pair_index, src_x, src_y, dst_x, dst_y)
    Returns: (pair_index, cost_or_None, path_or_None)"""
    idx, sx, sy, dx, dy = args
    result = _worker_pf._search(sx, sy, dx, dy)
    if result is None:
        return (idx, None, None)
    # Reconstruct path from the actually reached tile
    prev = result["prev"]
    path: list[tuple[int, int]] = []
    node = result["reached"]
    while node is not None:
        path.append((node[0], node[1]))
        node = prev.get(node)
    path.reverse()
    # Connect original start/end to the snapped path endpoints
    if path and path[0] != (sx, sy):
        path.insert(0, (sx, sy))
    if path and path[-1] != (dx, dy):
        path.append((dx, dy))
    return (idx, result["cost"], path)


# -- TSP Solver (nearest-neighbor + 2-opt) --

def _make_cache_key(ax: int, ay: int, bx: int, by: int) -> tuple[int, int]:
    """Order-independent cache key for a coordinate pair."""
    k1 = ax * 100000 + ay
    k2 = bx * 100000 + by
    return (min(k1, k2), max(k1, k2))


_fallback_count = 0
_pathfind_count = 0


def _dist(a: Marker, b: Marker) -> float:
    global _fallback_count, _pathfind_count
    shortcut = _shortcut_cost(a, b)
    if shortcut is not None:
        return shortcut

    if CALIBRATION is not None:
        rs_a = px_to_rs(a.map_x, a.map_y)
        rs_b = px_to_rs(b.map_x, b.map_y)
        if rs_a and rs_b:
            ax, ay = int(round(rs_a[0])), int(round(rs_a[1]))
            bx, by = int(round(rs_b[0])), int(round(rs_b[1]))
            key = _make_cache_key(ax, ay, bx, by)
            if key in _dist_cache:
                return _dist_cache[key]
            # Cache miss - compute inline (shouldn't happen after precompute)
            pf = _load_pathfinder()
            if pf is not None:
                cost = pf.path_cost(ax, ay, bx, by)
                if cost is not None:
                    _pathfind_count += 1
                    _dist_cache[key] = float(cost)
                else:
                    _fallback_count += 1
                    _dist_cache[key] = _pixel_dist(a, b)
                return _dist_cache[key]

    return _pixel_dist(a, b)


def _route_length(markers: list[Marker], route: list[int]) -> float:
    total = 0.0
    for i in range(len(route) - 1):
        total += _dist(markers[route[i]], markers[route[i + 1]])
    return total


def _nearest_neighbor(markers: list[Marker], start: int = 0) -> list[int]:
    n = len(markers)
    visited = [False] * n
    route = [start]
    visited[start] = True
    for _ in range(n - 1):
        curr = route[-1]
        best_d = float("inf")
        best_j = -1
        for j in range(n):
            if not visited[j]:
                d = _dist(markers[curr], markers[j])
                if d < best_d:
                    best_d = d
                    best_j = j
        route.append(best_j)
        visited[best_j] = True
    return route


def _two_opt(markers: list[Marker], route: list[int], max_iters: int = 5000) -> list[int]:
    n = len(route)
    best = route[:]
    improved = True
    iters = 0
    while improved and iters < max_iters:
        improved = False
        iters += 1
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                # Cost of reversing segment [i..j]
                a, b = best[i - 1], best[i]
                c, d = best[j], best[(j + 1) % n] if j + 1 < n else best[0]
                old = _dist(markers[a], markers[b]) + _dist(markers[c], markers[d])
                new = _dist(markers[a], markers[c]) + _dist(markers[b], markers[d])
                if new < old - 1e-6:
                    best[i:j + 1] = reversed(best[i:j + 1])
                    improved = True
    return best


def solve_tsp(markers: list[Marker], start_xy: tuple[float, float] | None = None) -> list[int]:
    """Return an optimised visit order for the given markers.
    If start_xy is given, find the nearest marker to that point and force it as start."""
    if len(markers) <= 2:
        return list(range(len(markers)))

    forced_start = None
    if start_xy is not None:
        # Find nearest marker to the start point
        best_d = float("inf")
        for i, m in enumerate(markers):
            d = math.sqrt((m.map_x - start_xy[0]) ** 2 + (m.map_y - start_xy[1]) ** 2)
            if d < best_d:
                best_d = d
                forced_start = i

    # Try multiple starting points and keep the best
    best_route = None
    best_len = float("inf")

    if forced_start is not None:
        starts = [forced_start]
    else:
        starts = list(range(min(len(markers), 10)))
        random.seed(42)
        if len(markers) > 10:
            starts += random.sample(range(len(markers)), min(5, len(markers)))

    for s in starts:
        route = _nearest_neighbor(markers, s)
        route = _two_opt(markers, route)
        length = _route_length(markers, route)
        if length < best_len:
            best_len = length
            best_route = route

    return best_route


class MapViewer:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("OSRS Map Planner")
        self.root.geometry("1200x800")

        self._build_ui()
        self._load_image()

        self.zoom = 0.1
        self.offset_x = 0.0
        self.offset_y = 0.0

        self.markers: list[Marker] = []
        self.selected_color = 0
        self.complete_mode = False
        self._route_cancelled = False
        self._computing_route = False
        self._pool = None
        self._solved_routes: dict[str, list[int]] = {}

        self._drag_start_x = 0
        self._drag_start_y = 0
        self._drag_offset_x = 0.0
        self._drag_offset_y = 0.0

        self._tooltip_id: int | None = None
        self._tooltip_bg_id: int | None = None

        self._active_route: list[Marker] | None = None
        self._active_route_order: list[int] | None = None
        self._active_route_color: str | None = None

        self._bind_events()
        self._load_markers()
        self._load_routes()
        if not self._load_view():
            self._center_map()
        self._render()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._auto_save_loop()

    def _build_ui(self):
        top = tk.Frame(self.root, bg="#1a1a2e")
        top.pack(fill=tk.X)

        tk.Label(top, text="Marker colour:", bg="#1a1a2e", fg="#ccc").pack(
            side=tk.LEFT, padx=(10, 5)
        )

        self._color_buttons: list[tk.Button] = []
        for i, (color, name) in enumerate(zip(MARKER_COLORS, MARKER_NAMES)):
            btn = tk.Button(
                top,
                text=name,
                bg=color,
                fg="#fff" if i != 8 else "#333",
                width=6,
                relief=tk.SUNKEN if i == 0 else tk.RAISED,
                command=lambda idx=i: self._select_color(idx),
            )
            btn.pack(side=tk.LEFT, padx=2, pady=4)
            self._color_buttons.append(btn)

        self._complete_btn = tk.Button(
            top, text="Complete Mode: OFF", command=self._toggle_complete_mode,
            bg="#444", fg="#fff", width=16,
        )
        self._complete_btn.pack(side=tk.LEFT, padx=(15, 2), pady=4)

        tk.Button(
            top, text="Save", command=self._save_all, bg="#27ae60", fg="#fff"
        ).pack(side=tk.RIGHT, padx=5, pady=4)

        tk.Button(
            top, text="Clear All", command=self._clear_markers, bg="#c0392b", fg="#fff"
        ).pack(side=tk.RIGHT, padx=5, pady=4)

        route_bar = tk.Frame(self.root, bg="#12122a")
        route_bar.pack(fill=tk.X)

        tk.Label(route_bar, text="Routes:", bg="#12122a", fg="#ccc").pack(
            side=tk.LEFT, padx=(10, 5)
        )

        route_phases = [
            (0, "Phase 1 (Red)"),
            (2, "Phase 2 (Yellow)"),
            (3, "Phase 3 (Green)"),
        ]
        for cidx, label in route_phases:
            color = MARKER_COLORS[cidx]
            tk.Button(
                route_bar, text=label, bg="#222", fg=color,
                command=lambda c=cidx, col=color: self._show_route(c, col),
            ).pack(side=tk.LEFT, padx=3, pady=3)

        tk.Button(
            route_bar, text="Clear Route", bg="#222", fg="#888",
            command=self._clear_route,
        ).pack(side=tk.LEFT, padx=(15, 3), pady=3)

        self._cancel_btn = tk.Button(
            route_bar, text="Cancel", bg="#c0392b", fg="#fff",
            command=self._cancel_route_compute, state=tk.DISABLED,
        )
        self._cancel_btn.pack(side=tk.LEFT, padx=3, pady=3)

        self._route_label = tk.Label(
            route_bar, text="", bg="#12122a", fg="#aaa", font=("Arial", 9),
        )
        self._route_label.pack(side=tk.LEFT, padx=10)

        self._progress_frame = tk.Frame(route_bar, bg="#12122a")
        self._progress_frame.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))
        self._progress_bar = tk.Canvas(
            self._progress_frame, height=12, bg="#333", highlightthickness=0,
        )
        self._progress_bar.pack(fill=tk.X)
        self._progress_bar.pack_forget()  # Hidden by default

        self.canvas = tk.Canvas(self.root, bg="#0f0f23", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self._status = tk.Label(
            self.root, text="", bg="#1a1a2e", fg="#888", anchor=tk.W
        )
        self._status.pack(fill=tk.X)

    def _load_image(self):
        from PIL import ImageEnhance
        img = Image.open(MAP_PATH)
        self._full_image = ImageEnhance.Brightness(img).enhance(MAP_DIM)
        self._img_w, self._img_h = self._full_image.size
        self._tk_image: ImageTk.PhotoImage | None = None

    def _center_map(self):
        cw = self.canvas.winfo_width() or 1200
        ch = self.canvas.winfo_height() or 800
        self.offset_x = (cw - self._img_w * self.zoom) / 2
        self.offset_y = (ch - self._img_h * self.zoom) / 2

    def _bind_events(self):
        self.canvas.bind("<ButtonPress-2>", self._on_drag_start)
        self.canvas.bind("<B2-Motion>", self._on_drag)
        self.canvas.bind("<MouseWheel>", self._on_scroll)
        self.canvas.bind("<Button-4>", self._on_scroll_up)
        self.canvas.bind("<Button-5>", self._on_scroll_down)
        self.canvas.bind("<ButtonPress-1>", self._on_left_click)
        self.canvas.bind("<ButtonPress-3>", self._on_right_click)
        self.canvas.bind("<Motion>", self._on_mouse_move)
        self.canvas.bind("<Configure>", lambda e: self._render())

    def _select_color(self, idx: int):
        for i, btn in enumerate(self._color_buttons):
            btn.config(relief=tk.SUNKEN if i == idx else tk.RAISED)
        self.selected_color = idx

    def _toggle_complete_mode(self):
        self.complete_mode = not self.complete_mode
        if self.complete_mode:
            self._complete_btn.config(text="Complete Mode: ON", bg="#e74c3c")
            self.canvas.config(cursor="crosshair")
        else:
            self._complete_btn.config(text="Complete Mode: OFF", bg="#444")
            self.canvas.config(cursor="")

    # -- Routes --

    def _update_progress(self, done: int, total: int, label: str):
        self._route_label.config(text=f"{label}: {done}/{total}")
        self._progress_bar.delete("all")
        w = self._progress_bar.winfo_width()
        if total > 0 and w > 0:
            fill_w = max(1, int(w * done / total))
            self._progress_bar.create_rectangle(0, 0, fill_w, 12, fill="#e74c3c", outline="")
        self.root.update_idletasks()

    def _cancel_route_compute(self):
        self._route_cancelled = True
        if hasattr(self, '_pool') and self._pool is not None:
            self._pool.terminate()

    def _set_computing(self, active: bool):
        self._computing_route = active
        self._route_cancelled = False
        self._cancel_btn.config(state=tk.NORMAL if active else tk.DISABLED)
        if active:
            self._progress_bar.pack(fill=tk.X)
        else:
            self._progress_bar.delete("all")
            self._progress_bar.pack_forget()

    def _show_route(self, color_idx: int, color: str):
        if self._computing_route:
            return
        phase_markers = [m for m in self.markers if m.color_idx == color_idx and not m.completed]
        if not phase_markers:
            self._route_label.config(text="No uncompleted markers for this phase")
            return

        n = len(phase_markers)

        # Check for a saved route that matches current markers
        saved_order = self._solved_routes.get(str(color_idx))
        if saved_order is not None and len(saved_order) == n:
            self._active_route = phase_markers
            self._active_route_order = saved_order
            self._active_route_color = color
            cost = _route_length(phase_markers, saved_order)
            self._route_label.config(
                text=f"Route: {n} stops, cost: {cost:.0f} ticks (cached)"
            )
            self._render()
            return
        total_pairs = n * (n - 1) // 2
        self._set_computing(True)
        t0 = time.time()

        # Build work items: convert pixel coords to OSRS coords
        work_items = []  # (pair_idx, sx, sy, dx, dy)
        pair_keys = []   # cache keys matching each pair_idx
        pair_fallbacks = []  # pixel distance fallback for each pair
        pair_idx = 0
        for i in range(n):
            for j in range(i + 1, n):
                a, b = phase_markers[i], phase_markers[j]
                sc = _shortcut_cost(a, b)
                if sc is not None:
                    # Shortcut - no pathfinding needed
                    rs_a = px_to_rs(a.map_x, a.map_y)
                    rs_b = px_to_rs(b.map_x, b.map_y)
                    if rs_a and rs_b:
                        ax, ay = int(round(rs_a[0])), int(round(rs_a[1]))
                        bx, by = int(round(rs_b[0])), int(round(rs_b[1]))
                        _dist_cache[_make_cache_key(ax, ay, bx, by)] = sc
                    pair_idx += 1
                    continue

                if CALIBRATION is not None:
                    rs_a = px_to_rs(a.map_x, a.map_y)
                    rs_b = px_to_rs(b.map_x, b.map_y)
                    if rs_a and rs_b:
                        ax, ay = int(round(rs_a[0])), int(round(rs_a[1]))
                        bx, by = int(round(rs_b[0])), int(round(rs_b[1]))
                        key = _make_cache_key(ax, ay, bx, by)
                        if key in _dist_cache:
                            continue  # Already computed (loaded from disk or prior phase)
                        work_items.append((len(pair_keys), ax, ay, bx, by))
                        pair_keys.append(key)
                        pair_fallbacks.append(_pixel_dist(a, b))
                pair_idx += 1

        if not work_items:
            self._set_computing(False)
            self._route_label.config(text="No paths to compute")
            return

        # Fan out to worker pool
        from multiprocessing import Pool
        total = len(work_items)
        self._update_progress(0, total, f"Computing paths (0/{total}, {NUM_WORKERS} workers)")

        pool = Pool(processes=NUM_WORKERS, initializer=_worker_init)
        self._pool = pool
        try:
            results_iter = pool.imap_unordered(_worker_find_path, work_items, chunksize=4)
            done = 0
            fallback_count = 0
            pathfind_count = 0
            for idx, cost, path in results_iter:
                if self._route_cancelled:
                    break
                key = pair_keys[idx]
                fallback = pair_fallbacks[idx]
                if cost is not None:
                    _dist_cache[key] = float(cost)
                    if path:
                        _path_cache[key] = path
                    pathfind_count += 1
                else:
                    _dist_cache[key] = fallback
                    fallback_count += 1
                done += 1
                if done % 5 == 0 or done == total:
                    elapsed = time.time() - t0
                    rate = done / elapsed if elapsed > 0 else 0
                    remaining = (total - done) / rate if rate > 0 else 0
                    self._update_progress(
                        done, total,
                        f"Computing paths ({remaining:.0f}s left, {NUM_WORKERS}w)",
                    )
        finally:
            pool.terminate()
            pool.join()
            self._pool = None

        if self._route_cancelled:
            self._set_computing(False)
            self._route_label.config(text="Cancelled.")
            return

        self._route_label.config(text=f"Optimising route for {n} markers...")
        self.root.update_idletasks()

        # Phase 1 (Red, idx 0) starts at spawn point
        start = (2163.0, 3342.0) if color_idx == 0 else None
        order = solve_tsp(phase_markers, start_xy=start)
        self._active_route = phase_markers
        self._active_route_order = order
        self._active_route_color = color

        self._set_computing(False)
        elapsed = time.time() - t0
        stats = f"Route: {n} stops, cost: {_route_length(phase_markers, order):.0f} ticks ({elapsed:.1f}s)"
        if fallback_count > 0:
            stats += f" [{fallback_count} fallback]"
        print(f"[route] {pathfind_count} pathfound, {fallback_count} fallback to pixel dist")
        self._route_label.config(text=stats)
        self._save_routes()
        self._render()

    def _get_cached_path(self, m1: Marker, m2: Marker) -> list[tuple[int, int]] | None:
        """Look up a precomputed path between two markers."""
        if CALIBRATION is None:
            return None
        rs_a = px_to_rs(m1.map_x, m1.map_y)
        rs_b = px_to_rs(m2.map_x, m2.map_y)
        if not rs_a or not rs_b:
            return None
        ax, ay = int(round(rs_a[0])), int(round(rs_a[1]))
        bx, by = int(round(rs_b[0])), int(round(rs_b[1]))
        key = _make_cache_key(ax, ay, bx, by)
        path = _path_cache.get(key)
        if path is None:
            return None
        # The path might be stored A→B but we need B→A; check and reverse
        if path and len(path) > 1:
            if abs(path[0][0] - ax) + abs(path[0][1] - ay) > abs(path[-1][0] - ax) + abs(path[-1][1] - ay):
                path = list(reversed(path))
        return path

    def _clear_route(self):
        self._active_route = None
        self._active_route_order = None
        self._active_route_color = None
        self._route_label.config(text="")
        self._render()

    # -- Pan --

    def _on_drag_start(self, event):
        self._drag_start_x = event.x
        self._drag_start_y = event.y
        self._drag_offset_x = self.offset_x
        self._drag_offset_y = self.offset_y

    def _on_drag(self, event):
        self.offset_x = self._drag_offset_x + (event.x - self._drag_start_x)
        self.offset_y = self._drag_offset_y + (event.y - self._drag_start_y)
        self._render()

    # -- Left click: place marker --

    def _on_left_click(self, event):
        if self.complete_mode:
            self._toggle_nearest_marker(event.x, event.y)
            return
        mx, my = self._screen_to_map(event.x, event.y)
        if mx < 0 or my < 0 or mx > self._img_w or my > self._img_h:
            return
        self._place_marker(mx, my)

    def _toggle_nearest_marker(self, sx, sy):
        for marker in self.markers:
            mx, my = self._map_to_screen(marker.map_x, marker.map_y)
            if abs(sx - mx) < MARKER_RADIUS + 6 and abs(sy - my) < MARKER_RADIUS + 6:
                marker.completed = not marker.completed
                self._save_markers()
                self._render()
                return

    # -- Zoom --

    def _apply_zoom(self, event_x, event_y, factor):
        old_zoom = self.zoom
        self.zoom = max(MIN_ZOOM, min(MAX_ZOOM, self.zoom * factor))
        ratio = self.zoom / old_zoom
        self.offset_x = event_x - ratio * (event_x - self.offset_x)
        self.offset_y = event_y - ratio * (event_y - self.offset_y)
        self._render()

    def _on_scroll(self, event):
        factor = 1.15 if event.delta > 0 else 1 / 1.15
        self._apply_zoom(event.x, event.y, factor)

    def _on_scroll_up(self, event):
        self._apply_zoom(event.x, event.y, 1.15)

    def _on_scroll_down(self, event):
        self._apply_zoom(event.x, event.y, 1 / 1.15)

    # -- Markers --

    def _screen_to_map(self, sx, sy):
        mx = (sx - self.offset_x) / self.zoom
        my = (sy - self.offset_y) / self.zoom
        return mx, my

    def _map_to_screen(self, mx, my):
        sx = mx * self.zoom + self.offset_x
        sy = my * self.zoom + self.offset_y
        return sx, sy

    def _on_right_click(self, event):
        mx, my = self._screen_to_map(event.x, event.y)
        if mx < 0 or my < 0 or mx > self._img_w or my > self._img_h:
            return

        self._show_color_menu(event, mx, my)

    def _show_color_menu(self, event, mx, my):
        menu = tk.Menu(self.root, tearoff=0)

        # Check if clicking near an existing marker for deletion
        for i, marker in enumerate(self.markers):
            sx, sy = self._map_to_screen(marker.map_x, marker.map_y)
            if abs(event.x - sx) < MARKER_RADIUS + 4 and abs(event.y - sy) < MARKER_RADIUS + 4:
                menu.add_command(
                    label=f"Delete: {marker.text[:40]}",
                    command=lambda idx=i: self._delete_marker(idx),
                )
                menu.add_separator()
                break

        menu.add_command(
            label=f"Place {MARKER_NAMES[self.selected_color]} marker here",
            command=lambda: self._place_marker(mx, my),
        )
        menu.add_separator()
        for i, name in enumerate(MARKER_NAMES):
            menu.add_command(
                label=f"Place {name} marker",
                command=lambda idx=i, x=mx, y=my: self._place_marker_with_color(x, y, idx),
            )

        menu.tk_popup(event.x_root, event.y_root)

    def _place_marker(self, mx, my):
        self._place_marker_with_color(mx, my, self.selected_color)

    def _place_marker_with_color(self, mx, my, color_idx):
        text = simpledialog.askstring(
            "Marker", "What needs to be done here?", parent=self.root
        )
        if text:
            self.markers.append(Marker(mx, my, color_idx, text))
            self._save_markers()
            self._render()

    def _delete_marker(self, idx):
        if 0 <= idx < len(self.markers):
            self.markers.pop(idx)
            self._save_markers()
            self._render()

    # -- Tooltip --

    def _on_mouse_move(self, event):
        self._clear_tooltip()

        for marker in self.markers:
            sx, sy = self._map_to_screen(marker.map_x, marker.map_y)
            if abs(event.x - sx) < MARKER_RADIUS + 4 and abs(event.y - sy) < MARKER_RADIUS + 4:
                self._show_tooltip(sx, sy, marker)
                break

        map_x, map_y = self._screen_to_map(event.x, event.y)
        rs = px_to_rs(map_x, map_y)
        coord_str = f"Pixel: ({map_x:.0f}, {map_y:.0f})"
        if rs:
            coord_str += f"  |  OSRS: ({rs[0]:.0f}, {rs[1]:.0f})"
        self._status.config(
            text=f"  Zoom: {self.zoom:.2f}x  |  {coord_str}  |  "
            f"Markers: {len(self.markers)}  |  Colour: {MARKER_NAMES[self.selected_color]}"
        )

    def _show_tooltip(self, sx, sy, marker: Marker):
        color = MARKER_COLORS[marker.color_idx]
        tx, ty = sx + MARKER_RADIUS + 6, sy - 12

        self._tooltip_bg_id = self.canvas.create_rectangle(
            tx - 4, ty - 2, tx + len(marker.text) * 7 + 8, ty + 18,
            fill="#1a1a2e", outline=color, width=1,
        )
        self._tooltip_id = self.canvas.create_text(
            tx + 2, ty + 8, text=marker.text, fill="#fff",
            font=("Arial", 10), anchor=tk.W,
        )

    def _clear_tooltip(self):
        if self._tooltip_id is not None:
            self.canvas.delete(self._tooltip_id)
            self._tooltip_id = None
        if self._tooltip_bg_id is not None:
            self.canvas.delete(self._tooltip_bg_id)
            self._tooltip_bg_id = None

    # -- Persistence --

    def _backup(self, path: str):
        """Rotate backups: path.bak2 -> path.bak3, path.bak1 -> path.bak2, path -> path.bak1"""
        for i in range(3, 1, -1):
            src = f"{path}.bak{i - 1}"
            dst = f"{path}.bak{i}"
            if os.path.exists(src):
                os.replace(src, dst)
        if os.path.exists(path):
            os.replace(path, f"{path}.bak1")

    def _save_markers(self):
        self._backup(SAVE_PATH)
        data = [m.to_dict() for m in self.markers]
        with open(SAVE_PATH, "w") as f:
            json.dump(data, f, indent=2)

    def _load_markers(self):
        if os.path.exists(SAVE_PATH):
            with open(SAVE_PATH) as f:
                data = json.load(f)
            self.markers = [Marker.from_dict(d) for d in data]

    def _save_view(self):
        data = {"zoom": self.zoom, "offset_x": self.offset_x, "offset_y": self.offset_y}
        with open(VIEW_PATH, "w") as f:
            json.dump(data, f)

    def _load_view(self) -> bool:
        if os.path.exists(VIEW_PATH):
            try:
                with open(VIEW_PATH) as f:
                    data = json.load(f)
                self.zoom = data["zoom"]
                self.offset_x = data["offset_x"]
                self.offset_y = data["offset_y"]
                return True
            except (json.JSONDecodeError, KeyError):
                pass
        return False

    def _save_routes(self):
        """Save precomputed distance cache, path cache, and solved route orders."""
        # Save solved route orders keyed by color index
        solved = {}
        if self._active_route and self._active_route_order is not None:
            # Find which color this route belongs to
            for cidx in [0, 2, 3]:
                phase_markers = [m for m in self.markers if m.color_idx == cidx and not m.completed]
                if (len(phase_markers) == len(self._active_route) and
                        all(a.map_x == b.map_x and a.map_y == b.map_y
                            for a, b in zip(phase_markers, self._active_route))):
                    solved[str(cidx)] = self._active_route_order
                    break

        # Merge with previously saved solved routes
        if os.path.exists(ROUTES_PATH):
            try:
                with open(ROUTES_PATH) as f:
                    old = json.load(f)
                for k, v in old.get("solved_routes", {}).items():
                    if k not in solved:
                        solved[k] = v
            except (json.JSONDecodeError, ValueError):
                pass

        data = {
            "dist_cache": {f"{k[0]}_{k[1]}": v for k, v in _dist_cache.items()},
            "path_cache": {f"{k[0]}_{k[1]}": v for k, v in _path_cache.items()},
            "solved_routes": solved,
        }
        with open(ROUTES_PATH, "w") as f:
            json.dump(data, f)
        print(f"[routes] Saved {len(_dist_cache)} distances, {len(_path_cache)} paths, {len(solved)} solved routes")

    def _load_routes(self):
        """Load precomputed distance cache, path cache, and solved routes."""
        if not os.path.exists(ROUTES_PATH):
            return
        try:
            with open(ROUTES_PATH) as f:
                data = json.load(f)
            for k, v in data.get("dist_cache", {}).items():
                parts = k.split("_")
                _dist_cache[(int(parts[0]), int(parts[1]))] = v
            for k, v in data.get("path_cache", {}).items():
                parts = k.split("_")
                _path_cache[(int(parts[0]), int(parts[1]))] = [tuple(p) for p in v]
            self._solved_routes = data.get("solved_routes", {})
            print(f"[routes] Loaded {len(_dist_cache)} distances, {len(_path_cache)} paths, {len(self._solved_routes)} solved routes")
        except (json.JSONDecodeError, ValueError, IndexError) as e:
            print(f"[routes] Failed to load routes: {e}")

    def _save_all(self):
        self._save_markers()
        self._save_routes()
        self._save_view()

    def _auto_save_loop(self):
        self._save_view()
        self.root.after(30_000, self._auto_save_loop)

    def _on_close(self):
        self._save_all()
        self.root.destroy()

    def _clear_markers(self):
        if self.markers:
            self.markers.clear()
            self._save_markers()
            self._render()

    # -- Rendering --

    def _render(self):
        self.canvas.delete("all")

        cw = self.canvas.winfo_width()
        ch = self.canvas.winfo_height()
        if cw < 2 or ch < 2:
            return

        # Compute visible region in map coordinates
        vx0 = max(0, int(-self.offset_x / self.zoom))
        vy0 = max(0, int(-self.offset_y / self.zoom))
        vx1 = min(self._img_w, int((cw - self.offset_x) / self.zoom))
        vy1 = min(self._img_h, int((ch - self.offset_y) / self.zoom))

        if vx1 <= vx0 or vy1 <= vy0:
            return

        # Crop and resize only the visible portion
        cropped = self._full_image.crop((vx0, vy0, vx1, vy1))
        display_w = max(1, int((vx1 - vx0) * self.zoom))
        display_h = max(1, int((vy1 - vy0) * self.zoom))
        resized = cropped.resize((display_w, display_h), Image.NEAREST)

        self._tk_image = ImageTk.PhotoImage(resized)

        screen_x = self.offset_x + vx0 * self.zoom
        screen_y = self.offset_y + vy0 * self.zoom
        self.canvas.create_image(screen_x, screen_y, anchor=tk.NW, image=self._tk_image)

        # Draw route lines
        if self._active_route and self._active_route_order:
            order = self._active_route_order
            markers_list = self._active_route
            color = self._active_route_color or "#fff"
            for i in range(len(order) - 1):
                m1 = markers_list[order[i]]
                m2 = markers_list[order[i + 1]]
                is_jump = _shortcut_cost(m1, m2) is not None
                if is_jump:
                    sx1, sy1 = self._map_to_screen(m1.map_x, m1.map_y)
                    sx2, sy2 = self._map_to_screen(m2.map_x, m2.map_y)
                    self.canvas.create_line(
                        sx1, sy1, sx2, sy2,
                        fill=color, width=1, dash=(2, 12),
                    )
                else:
                    # Try to draw the real pathfound route
                    path = self._get_cached_path(m1, m2)
                    if path and len(path) > 1:
                        # Subsample long paths for performance
                        step = max(1, len(path) // 200)
                        sampled = path[::step]
                        if sampled[-1] != path[-1]:
                            sampled.append(path[-1])
                        coords = []
                        for rx, ry in sampled:
                            px = rs_to_px(rx, ry)
                            if px:
                                sx, sy = self._map_to_screen(px[0], px[1])
                                coords.extend([sx, sy])
                        if len(coords) >= 4:
                            self.canvas.create_line(
                                *coords, fill=color, width=2, smooth=True,
                            )
                    else:
                        sx1, sy1 = self._map_to_screen(m1.map_x, m1.map_y)
                        sx2, sy2 = self._map_to_screen(m2.map_x, m2.map_y)
                        self.canvas.create_line(
                            sx1, sy1, sx2, sy2,
                            fill=color, width=2, dash=(6, 4),
                        )
            # Number the stops
            for stop_num, idx in enumerate(order):
                m = markers_list[idx]
                sx, sy = self._map_to_screen(m.map_x, m.map_y)
                if -20 < sx < cw + 20 and -20 < sy < ch + 20:
                    self.canvas.create_text(
                        sx, sy - MARKER_RADIUS - 8,
                        text=str(stop_num + 1), fill=color,
                        font=("Arial", 8, "bold"),
                    )

        # Draw markers
        for marker in self.markers:
            sx, sy = self._map_to_screen(marker.map_x, marker.map_y)
            if -20 < sx < cw + 20 and -20 < sy < ch + 20:
                r = MARKER_RADIUS
                color = MARKER_COLORS[marker.color_idx]
                if marker.completed:
                    outline = "#555"
                    fill = "#333"
                    self.canvas.create_oval(
                        sx - r, sy - r, sx + r, sy + r,
                        fill=fill, outline=outline, width=2,
                    )
                    # Small check mark
                    self.canvas.create_text(
                        sx, sy, text="\u2713", fill="#888", font=("Arial", 9, "bold"),
                    )
                else:
                    self.canvas.create_oval(
                        sx - r, sy - r, sx + r, sy + r,
                        fill=color, outline="#fff", width=2,
                    )


def main():
    root = tk.Tk()
    MapViewer(root)
    root.mainloop()


if __name__ == "__main__":
    main()
