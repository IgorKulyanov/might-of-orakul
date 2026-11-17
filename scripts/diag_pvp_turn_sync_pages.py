#!/usr/bin/env python3
"""Same as diag_pvp_turn_sync.py but через Pages CF WS proxy."""
from __future__ import annotations

# Reuse main diag with alternate WS.
import diag_pvp_turn_sync as core

core.WS = "wss://might-of-orakul.pages.dev/ws/pvp"
print("USING", core.WS)
raise SystemExit(core.main())
