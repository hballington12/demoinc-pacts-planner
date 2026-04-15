"""
OSRS Pathfinder Module
Port of the Java shortest-path plugin for Old School RuneScape.

Loads collision data from a ZIP of region BitSets and transports from TSV files,
then performs BFS/Dijkstra pathfinding on plane 0.
"""

from __future__ import annotations

import heapq
import zipfile
from collections import defaultdict, deque
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Collision map helpers
# ---------------------------------------------------------------------------

REGION_SIZE = 64
TILES_PER_PLANE = REGION_SIZE * REGION_SIZE  # 4096


def _bytes_to_bitset(data: bytes) -> bytearray:
    """Return a bytearray where we can test individual bit indices.

    Java's ``BitSet.valueOf(byte[])`` treats bytes as little-endian packed
    bits: byte 0 bit 0 = index 0, byte 0 bit 7 = index 7, byte 1 bit 0 =
    index 8, etc.  We store the raw bytes so we can test any bit cheaply.
    """
    return bytearray(data)


def _bit_test(bs: bytearray, index: int) -> bool:
    """Test whether *index* is set in the bitset stored as a ``bytearray``."""
    byte_idx = index >> 3
    if byte_idx >= len(bs):
        return False
    return bool(bs[byte_idx] & (1 << (index & 7)))


# ---------------------------------------------------------------------------
# Region storage
# ---------------------------------------------------------------------------


class _Region:
    """Collision data for one 64x64 map region."""

    __slots__ = ("bs", "planes")

    def __init__(self, data: bytes) -> None:
        self.bs: bytearray = _bytes_to_bitset(data)
        num_tile_slots = len(data) * 8 // 2  # 2 bits per tile
        self.planes: int = (num_tile_slots + TILES_PER_PLANE - 1) // TILES_PER_PLANE

    # -- raw flag access ---------------------------------------------------

    def _flag(self, x: int, y: int, z: int, flag: int) -> bool:
        """Return the raw flag (0=north, 1=east) for a local tile."""
        idx = (z * TILES_PER_PLANE + y * REGION_SIZE + x) * 2 + flag
        return _bit_test(self.bs, idx)


# ---------------------------------------------------------------------------
# Collision map – stores all regions, answers direction queries in world coords
# ---------------------------------------------------------------------------


class _CollisionMap:
    """In-memory collision map covering all loaded regions."""

    def __init__(self) -> None:
        # keyed by (regionX, regionY)
        self.regions: dict[tuple[int, int], _Region] = {}

    # -- internal helpers --------------------------------------------------

    def _flag(self, wx: int, wy: int, z: int, flag: int) -> bool:
        rx, lx = divmod(wx, REGION_SIZE)
        ry, ly = divmod(wy, REGION_SIZE)
        region = self.regions.get((rx, ry))
        if region is None:
            return False
        if z >= region.planes:
            return False
        return region._flag(lx, ly, z, flag)

    # -- direction predicates (world coords) --------------------------------

    def n(self, x: int, y: int, z: int) -> bool:
        return self._flag(x, y, z, 0)

    def s(self, x: int, y: int, z: int) -> bool:
        return self._flag(x, y - 1, z, 0)

    def e(self, x: int, y: int, z: int) -> bool:
        return self._flag(x, y, z, 1)

    def w(self, x: int, y: int, z: int) -> bool:
        return self._flag(x - 1, y, z, 1)

    def ne(self, x: int, y: int, z: int) -> bool:
        return (
            self.n(x, y, z)
            and self.e(x, y + 1, z)
            and self.e(x, y, z)
            and self.n(x + 1, y, z)
        )

    def nw(self, x: int, y: int, z: int) -> bool:
        return (
            self.n(x, y, z)
            and self.w(x, y + 1, z)
            and self.w(x, y, z)
            and self.n(x - 1, y, z)
        )

    def se(self, x: int, y: int, z: int) -> bool:
        return (
            self.s(x, y, z)
            and self.e(x, y - 1, z)
            and self.e(x, y, z)
            and self.s(x + 1, y, z)
        )

    def sw(self, x: int, y: int, z: int) -> bool:
        return (
            self.s(x, y, z)
            and self.w(x, y - 1, z)
            and self.w(x, y, z)
            and self.s(x - 1, y, z)
        )

    def is_blocked(self, x: int, y: int, z: int) -> bool:
        return (
            not self.n(x, y, z)
            and not self.s(x, y, z)
            and not self.e(x, y, z)
            and not self.w(x, y, z)
        )


# ---------------------------------------------------------------------------
# Transport loading
# ---------------------------------------------------------------------------


def _parse_coord(token: str) -> tuple[int, int, int] | None:
    """Parse ``'x y z'`` into ``(x, y, z)`` or return *None*."""
    parts = token.strip().split()
    if len(parts) != 3:
        return None
    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        return None


_TransportDict = dict[tuple[int, int, int], list[tuple[tuple[int, int, int], int]]]


def _load_single_tsv(
    tsv_path: str,
    transports: _TransportDict,
) -> int:
    """Load transports from one TSV file into *transports*.

    Detects the Duration column from the header comment.
    Handles permutation transports (fairy rings, spirit trees, quetzals)
    where origin or destination is blank.
    Returns the number of transport entries added.
    """
    duration_col = -1
    count = 0
    permutation_origins: list[tuple[int, int, int]] = []
    permutation_dests: list[tuple[int, int, int]] = []

    with open(tsv_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue

            # Parse header to find Duration column
            if line.startswith("#"):
                if duration_col == -1 and "Duration" in line:
                    cols = [c.strip().lower() for c in line.lstrip("# ").split("\t")]
                    for i, c in enumerate(cols):
                        if c == "duration":
                            duration_col = i
                            break
                continue

            fields = line.split("\t")
            if len(fields) < 2:
                continue

            origin = _parse_coord(fields[0])
            dest = _parse_coord(fields[1])
            duration = 1
            if (
                duration_col >= 0
                and len(fields) > duration_col
                and fields[duration_col].strip()
            ):
                try:
                    duration = int(fields[duration_col].strip())
                except ValueError:
                    duration = 1

            # Permutation transport: origin only or dest only
            if origin is not None and dest is None:
                permutation_origins.append(origin)
                continue
            if origin is None and dest is not None:
                permutation_dests.append(dest)
                continue
            if origin is None or dest is None:
                continue

            transports[origin].append((dest, duration))
            count += 1

    # Build permutation pairs (every origin can reach every dest and vice versa)
    if permutation_origins and permutation_dests:
        all_points = list(set(permutation_origins + permutation_dests))
        for a in all_points:
            for b in all_points:
                if a != b:
                    transports[a].append((b, duration))
                    count += 1

    return count


def _load_all_transports(
    transports_dir: str,
) -> tuple[_TransportDict, int]:
    """Load all transport TSV files from the directory."""
    import os

    transports: _TransportDict = defaultdict(list)
    total = 0
    for fname in sorted(os.listdir(transports_dir)):
        if not fname.endswith(".tsv"):
            continue
        fpath = os.path.join(transports_dir, fname)
        n = _load_single_tsv(fpath, transports)
        if n > 0:
            print(f"  {fname}: {n} entries")
        total += n
    return transports, total


# ---------------------------------------------------------------------------
# Pathfinder
# ---------------------------------------------------------------------------

# 8 neighbor directions: (dx, dy)
_WALK_DIRS: list[tuple[int, int, str]] = [
    (0, 1, "n"),
    (0, -1, "s"),
    (1, 0, "e"),
    (-1, 0, "w"),
    (1, 1, "ne"),
    (-1, 1, "nw"),
    (1, -1, "se"),
    (-1, -1, "sw"),
]


class OsrsPathfinder:
    """OSRS shortest-path finder operating on plane 0."""

    def __init__(self, collision_zip_path: str, transports_dir: str) -> None:
        self._cmap = _CollisionMap()
        self._transports: dict[
            tuple[int, int, int], list[tuple[tuple[int, int, int], int]]
        ] = {}

        self._load_collision(collision_zip_path)
        self._load_transports(transports_dir)
        self._apply_exclusions()

    # -- loading -----------------------------------------------------------

    def _load_collision(self, zip_path: str) -> None:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for name in zf.namelist():
                parts = name.split("_")
                if len(parts) != 2:
                    continue
                try:
                    rx, ry = int(parts[0]), int(parts[1])
                except ValueError:
                    continue
                data = zf.read(name)
                self._cmap.regions[(rx, ry)] = _Region(data)
        print(f"[pathfinder] Loaded {len(self._cmap.regions)} collision regions")

    def _load_transports(self, transports_dir: str) -> None:
        self._transports, count = _load_all_transports(transports_dir)
        print(f"[pathfinder] Loaded {count} transports total")

    def _apply_exclusions(self) -> None:
        """Remove transports near excluded coordinates."""
        # Quetzal stops not yet available
        excluded = [
            (1780, 3110),
            (1613, 3300),
            (1410, 3070),
            (1670, 2930),
            (1446, 3107),
            (1342, 3019),
        ]
        snap = 10
        removed = 0
        keys_to_check = list(self._transports.keys())
        for origin in keys_to_check:
            ox, oy, _ = origin
            for ex, ey in excluded:
                if abs(ox - ex) <= snap and abs(oy - ey) <= snap:
                    removed += len(self._transports[origin])
                    del self._transports[origin]
                    break
        # Also remove destinations pointing to excluded areas
        for origin, dests in self._transports.items():
            filtered = []
            for dest, dur in dests:
                dx, dy, _ = dest
                skip = False
                for ex, ey in excluded:
                    if abs(dx - ex) <= snap and abs(dy - ey) <= snap:
                        skip = True
                        removed += 1
                        break
                if not skip:
                    filtered.append((dest, dur))
            self._transports[origin] = filtered
        print(f"[pathfinder] Excluded {removed} transports near blocked quetzal stops")

    # -- direction check helper (plane 0) ----------------------------------

    def _can_move(self, x: int, y: int, direction: str) -> bool:
        cm = self._cmap
        z = 0
        if direction == "n":
            return cm.n(x, y, z)
        if direction == "s":
            return cm.s(x, y, z)
        if direction == "e":
            return cm.e(x, y, z)
        if direction == "w":
            return cm.w(x, y, z)
        if direction == "ne":
            return cm.ne(x, y, z)
        if direction == "nw":
            return cm.nw(x, y, z)
        if direction == "se":
            return cm.se(x, y, z)
        if direction == "sw":
            return cm.sw(x, y, z)
        return False

    def _snap_to_walkable(self, x: int, y: int, radius: int = 5) -> tuple[int, int]:
        """If (x, y) is blocked, find the nearest walkable tile within radius."""
        if not self._cmap.is_blocked(x, y, 0):
            return x, y
        best = None
        best_dist = float("inf")
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                nx, ny = x + dx, y + dy
                if not self._cmap.is_blocked(nx, ny, 0):
                    d = dx * dx + dy * dy
                    if d < best_dist:
                        best_dist = d
                        best = (nx, ny)
        return best if best else (x, y)

    # -- pathfinding -------------------------------------------------------

    def _search(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        max_iterations: int = 500_000,
    ) -> dict | None:
        """Run BFS/Dijkstra from (start) to (end) on plane 0.

        Returns ``{"cost": int, "prev": dict}`` if a path is found, else
        ``None``.  ``prev`` maps each ``(x, y, z)`` to its predecessor.
        """
        sx, sy = self._snap_to_walkable(start_x, start_y)
        start = (sx, sy, 0)
        end_x_orig, end_y_orig = end_x, end_y
        proximity = 5  # Succeed when within this many tiles of target

        if abs(sx - end_x) <= proximity and abs(sy - end_y) <= proximity:
            return {"cost": 0, "prev": {start: None}, "reached": start}

        # cost_so_far: best known cost to reach node
        cost: dict[tuple[int, int, int], int] = {start: 0}
        prev: dict[tuple[int, int, int], tuple[int, int, int] | None] = {start: None}

        # Walk deque (cost-1 neighbors) and transport heap
        walk_q: deque[tuple[int, tuple[int, int, int]]] = deque()
        walk_q.append((0, start))
        transport_q: list[tuple[int, tuple[int, int, int]]] = []

        iterations = 0

        while (walk_q or transport_q) and iterations < max_iterations:
            iterations += 1

            # Pick the queue with the lower-cost front element
            use_walk = False
            if walk_q and transport_q:
                if walk_q[0][0] <= transport_q[0][0]:
                    use_walk = True
            elif walk_q:
                use_walk = True

            if use_walk:
                cur_cost, cur = walk_q.popleft()
            else:
                cur_cost, cur = heapq.heappop(transport_q)

            # Skip stale entries
            if cur_cost > cost.get(cur, float("inf")):
                continue

            # Success: within proximity of target
            if (
                abs(cur[0] - end_x_orig) <= proximity
                and abs(cur[1] - end_y_orig) <= proximity
            ):
                return {"cost": cur_cost, "prev": prev, "reached": cur}

            cx, cy, cz = cur

            # -- walk neighbors (only on plane 0) -------------------------
            if cz == 0:
                for dx, dy, direction in _WALK_DIRS:
                    if not self._can_move(cx, cy, direction):
                        continue
                    nb = (cx + dx, cy + dy, 0)
                    new_cost = cur_cost + 1
                    if new_cost < cost.get(nb, float("inf")):
                        cost[nb] = new_cost
                        prev[nb] = cur
                        walk_q.append((new_cost, nb))

            # -- transport neighbors ---------------------------------------
            for dest, duration in self._transports.get(cur, []):
                new_cost = cur_cost + duration
                if new_cost < cost.get(dest, float("inf")):
                    cost[dest] = new_cost
                    prev[dest] = cur
                    heapq.heappush(transport_q, (new_cost, dest))

        return None

    def find_path(
        self, start_x: int, start_y: int, end_x: int, end_y: int
    ) -> list[tuple[int, int]] | None:
        """Return the list of ``(x, y)`` waypoints from start to end, or
        ``None`` if no path is found within the iteration budget."""
        result = self._search(start_x, start_y, end_x, end_y)
        if result is None:
            return None

        prev = result["prev"]
        path: list[tuple[int, int]] = []
        node: tuple[int, int, int] | None = result["reached"]
        while node is not None:
            path.append((node[0], node[1]))
            node = prev.get(node)
        path.reverse()
        return path

    def path_cost(
        self, start_x: int, start_y: int, end_x: int, end_y: int
    ) -> int | None:
        """Return the cost in ticks from start to end, or ``None``."""
        result = self._search(start_x, start_y, end_x, end_y)
        if result is None:
            return None
        return result["cost"]


# ---------------------------------------------------------------------------
# Quick smoke test when run directly
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os
    import time

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    collision_zip = os.path.join(
        base, "rsc", "shortest-path", "src", "main", "resources", "collision-map.zip"
    )
    transports_dir = os.path.join(
        base, "rsc", "shortest-path", "src", "main", "resources", "transports"
    )

    t0 = time.perf_counter()
    pf = OsrsPathfinder(collision_zip, transports_dir)
    t1 = time.perf_counter()
    print(f"[pathfinder] Init took {t1 - t0:.2f}s")

    # Lumbridge castle to Varrock west bank
    start = (3222, 3218)
    end = (3185, 3436)
    t2 = time.perf_counter()
    cost = pf.path_cost(*start, *end)
    t3 = time.perf_counter()
    print(f"[pathfinder] Lumbridge -> Varrock west bank: cost={cost} ({t3 - t2:.2f}s)")

    path = pf.find_path(*start, *end)
    if path:
        print(f"[pathfinder] Path length: {len(path)} waypoints")
        print(f"[pathfinder] First 5: {path[:5]}")
        print(f"[pathfinder] Last  5: {path[-5:]}")
    else:
        print("[pathfinder] No path found")
