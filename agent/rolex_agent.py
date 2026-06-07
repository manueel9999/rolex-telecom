"""
Rolex Telecom — Windows Agent
Controls Phone Link via tel: protocol + mouse clicks.
Coordinates calibrated for 1920x1080 maximized Phone Link.

Usage:
    python rolex_agent.py [--server URL] [--device DEVICE_ID]
"""

import asyncio
import json
import time
import sys
import os
import argparse
import ssl
import ctypes
import ctypes.wintypes
from enum import Enum

# DPI awareness — critical for correct mouse coordinates!
try:
    ctypes.windll.user32.SetProcessDPIAware()
except:
    pass

try:
    import websockets
except ImportError:
    print("[ERROR] websockets not installed. Run: pip install websockets")
    sys.exit(1)

try:
    import win32gui
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False
    print("[WARN] pywin32 not installed. Run: pip install pywin32")

# ===================================================
# MOUSE CLICK — the proven method!
# ===================================================
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

def mouse_click(x, y):
    """Click at screen coordinates."""
    ctypes.windll.user32.SetCursorPos(int(x), int(y))
    time.sleep(0.1)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    print(f"  -> Click at ({int(x)}, {int(y)})")

# ===================================================
# BUTTON POSITIONS (calibrated for 1920x1080)
# Phone Link maximized fullscreen
# ===================================================
# These are RELATIVE positions (0.0 - 1.0) within the window
# Calibrated from test_call.py on the actual machine:
#   CALL button:   (1676, 888) on 1920x1080 = (0.873, 0.822)
#   HANGUP button: (1758, 130) on 1920x1080 = (0.916, 0.120)

CALL_BTN_X = 0.873     # 1676 / 1920
CALL_BTN_Y = 0.822     # 888 / 1080
HANGUP_BTN_X = 0.916   # 1758 / 1920
HANGUP_BTN_Y = 0.120   # 130 / 1080
# Answer button — likely same area as hangup (incoming call popup)
ANSWER_BTN_X = 0.873
ANSWER_BTN_Y = 0.120


class CallState(Enum):
    IDLE = "idle"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTED = "connected"
    INCOMING = "incoming"


class RolexAgent:
    PHONELINK_TITLES = ["Phone Link", "Your Phone"]
    CALL_KEYWORDS = ["звонок на компьютере", "call on computer", "звонок на мобильном"]
    INCOMING_KEYWORDS = ["входящий", "incoming"]

    def __init__(self, server_url, device_id):
        self.server_url = server_url
        self.device_id = device_id
        self.ws = None
        self.call_state = CallState.IDLE
        self.current_number = ""
        self.call_start_time = None
        self.running = True
        self.reconnect_delay = 3

        self.ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE

        # Get screen size
        self.screen_w = ctypes.windll.user32.GetSystemMetrics(0)
        self.screen_h = ctypes.windll.user32.GetSystemMetrics(1)

    async def connect(self):
        url = f"{self.server_url}?type=agent&id={self.device_id}"
        use_ssl = self.server_url.startswith("wss://")

        while self.running:
            try:
                print(f"\n[CONN] Connecting to {self.server_url}...")
                kw = {"uri": url, "ping_interval": 20, "ping_timeout": 10, "close_timeout": 5}
                if use_ssl:
                    kw["ssl"] = self.ssl_ctx

                async with websockets.connect(**kw) as ws:
                    self.ws = ws
                    self.reconnect_delay = 3
                    print(f"[OK] Connected! Device: {self.device_id}")
                    print(f"[OK] Screen: {self.screen_w}x{self.screen_h}")
                    print(f"[OK] Waiting for commands...\n")

                    await self.send({"type": "phone_status", "status": "online"})

                    monitor = asyncio.create_task(self.monitor_phone_link())
                    pinger = asyncio.create_task(self.ping_loop())

                    try:
                        async for message in ws:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        print("[CONN] Connection lost")
                    finally:
                        monitor.cancel()
                        pinger.cancel()
                        self.ws = None

            except Exception as e:
                print(f"[ERROR] {e}")

            if self.running:
                print(f"[CONN] Reconnecting in {self.reconnect_delay}s...")
                await asyncio.sleep(self.reconnect_delay)
                self.reconnect_delay = min(30, self.reconnect_delay * 2)

    async def ping_loop(self):
        while True:
            try:
                await asyncio.sleep(15)
                await self.send({"type": "ping"})
            except asyncio.CancelledError:
                break
            except:
                pass

    async def handle_message(self, raw):
        try:
            msg = json.loads(raw)
            cmd = msg.get("type", "")

            if cmd in ("pong", "connected", "agent_status"):
                return

            if cmd == "call":
                number = msg.get("number", "")
                print(f"[CMD] CALL: {number}")
                await self.make_call(number)

            elif cmd == "hangup":
                print(f"[CMD] HANGUP")
                await self.hangup_call()

            elif cmd == "answer":
                print(f"[CMD] ANSWER")
                await self.answer_call()

            elif cmd == "dial":
                key = msg.get("key", "")
                print(f"[CMD] DIAL KEY: {key}")

            elif cmd == "mute":
                print(f"[CMD] MUTE (not supported via mouse)")

            else:
                print(f"[CMD] {cmd}")

        except json.JSONDecodeError:
            print(f"[ERROR] Parse error")

    async def send(self, msg):
        if self.ws:
            try:
                await self.ws.send(json.dumps(msg))
            except:
                pass

    # =============================================
    # CALL CONTROL — mouse click on Phone Link
    # =============================================

    def _ensure_phonelink_visible(self):
        """Make sure Phone Link is visible and maximized."""
        if not HAS_WIN32:
            return

        hwnd = self._find_phonelink_hwnd()
        if hwnd:
            try:
                if win32gui.IsIconic(hwnd):
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                    time.sleep(0.5)
                win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
                time.sleep(0.3)
                win32gui.SetForegroundWindow(hwnd)
            except:
                try:
                    ctypes.windll.user32.SwitchToThisWindow(hwnd, True)
                except:
                    pass

    def _click_at_relative(self, rel_x, rel_y):
        """Click at a position relative to screen size."""
        abs_x = int(self.screen_w * rel_x)
        abs_y = int(self.screen_h * rel_y)
        mouse_click(abs_x, abs_y)

    async def make_call(self, number):
        """Open tel:NUMBER, wait, click green Call button."""
        self.current_number = number
        self.call_state = CallState.DIALING

        clean = number.strip().replace(" ", "").replace("-", "")

        try:
            # Step 1: Open tel: → Phone Link fills the number
            os.startfile(f"tel:{clean}")
            print(f"  -> Opened tel:{clean}")

            # Step 2: Wait for Phone Link
            await asyncio.sleep(3)

            # Step 3: Make sure Phone Link is visible and maximized
            self._ensure_phonelink_visible()
            await asyncio.sleep(0.5)

            # Step 4: Click the green CALL button
            self._click_at_relative(CALL_BTN_X, CALL_BTN_Y)
            print(f"  -> Clicked CALL button")

            self.call_state = CallState.RINGING
            await self.send({
                "type": "call_status",
                "status": "ringing",
                "number": number,
            })

        except Exception as e:
            print(f"  [ERROR] {e}")
            await self.send({
                "type": "call_status",
                "status": "ended",
                "number": number,
            })
            self.call_state = CallState.IDLE

    async def hangup_call(self):
        """Click the red Hangup button."""
        self._ensure_phonelink_visible()
        await asyncio.sleep(0.3)

        # Click hangup button
        self._click_at_relative(HANGUP_BTN_X, HANGUP_BTN_Y)
        print(f"  -> Clicked HANGUP button")

        duration = 0
        if self.call_start_time:
            duration = int(time.time() - self.call_start_time)

        await self.send({
            "type": "call_status",
            "status": "ended",
            "number": self.current_number,
            "duration": duration,
        })

        self.call_state = CallState.IDLE
        self.current_number = ""
        self.call_start_time = None
        print(f"  -> Call ended ({duration}s)")

    async def answer_call(self):
        """Click the Answer button on incoming call."""
        self._ensure_phonelink_visible()
        await asyncio.sleep(0.3)

        # Answer button — typically near the hangup position
        self._click_at_relative(ANSWER_BTN_X, ANSWER_BTN_Y)
        print(f"  -> Clicked ANSWER button")

        self.call_state = CallState.CONNECTED
        self.call_start_time = time.time()

        await self.send({
            "type": "call_status",
            "status": "connected",
            "number": self.current_number,
        })

    # =============================================
    # WINDOW HELPERS
    # =============================================

    def _find_phonelink_hwnd(self):
        if not HAS_WIN32:
            return None
        result = [None]
        def cb(hwnd, _):
            title = win32gui.GetWindowText(hwnd)
            tl = title.lower()
            if "phone" in tl or "телефон" in tl or "связь" in tl:
                result[0] = hwnd
                return False
            return True
        try:
            win32gui.EnumWindows(cb, None)
        except:
            pass
        return result[0]

    def _find_call_window(self):
        if not HAS_WIN32:
            return None
        result = [None]
        def cb(hwnd, _):
            if not win32gui.IsWindowVisible(hwnd):
                return True
            title = win32gui.GetWindowText(hwnd).lower()
            for kw in self.CALL_KEYWORDS + self.INCOMING_KEYWORDS:
                if kw in title:
                    result[0] = hwnd
                    return False
            return True
        try:
            win32gui.EnumWindows(cb, None)
        except:
            pass
        return result[0]

    # =============================================
    # CALL STATE MONITORING
    # =============================================

    async def monitor_phone_link(self):
        last_state = CallState.IDLE
        while True:
            try:
                await asyncio.sleep(1.5)
                if not HAS_WIN32:
                    continue

                current = self._detect_call_state()
                if current != last_state:
                    print(f"[STATE] {last_state.value} -> {current.value}")

                    if current == CallState.INCOMING and last_state == CallState.IDLE:
                        self.call_state = CallState.INCOMING
                        self.current_number = "Unknown"
                        await self.send({
                            "type": "incoming_call",
                            "number": self.current_number,
                        })

                    elif current == CallState.CONNECTED and last_state in (
                        CallState.RINGING, CallState.DIALING, CallState.INCOMING
                    ):
                        self.call_state = CallState.CONNECTED
                        self.call_start_time = time.time()
                        await self.send({
                            "type": "call_status",
                            "status": "connected",
                            "number": self.current_number,
                        })

                    elif current == CallState.IDLE and last_state in (
                        CallState.CONNECTED, CallState.RINGING,
                        CallState.INCOMING, CallState.DIALING,
                    ):
                        duration = 0
                        if self.call_start_time:
                            duration = int(time.time() - self.call_start_time)
                        await self.send({
                            "type": "call_status",
                            "status": "ended",
                            "number": self.current_number,
                            "duration": duration,
                        })
                        self.call_state = CallState.IDLE
                        self.current_number = ""
                        self.call_start_time = None

                    last_state = current

            except asyncio.CancelledError:
                break
            except:
                pass

    def _detect_call_state(self):
        if not HAS_WIN32:
            return self.call_state
        try:
            call_found = False
            incoming_found = False
            def cb(hwnd, _):
                nonlocal call_found, incoming_found
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                title = win32gui.GetWindowText(hwnd).lower()
                for kw in self.INCOMING_KEYWORDS:
                    if kw in title:
                        incoming_found = True
                for kw in self.CALL_KEYWORDS:
                    if kw in title:
                        call_found = True
                return True
            win32gui.EnumWindows(cb, None)

            if incoming_found:
                return CallState.INCOMING
            elif call_found:
                if self.call_state in (CallState.DIALING, CallState.RINGING):
                    return CallState.RINGING
                return CallState.CONNECTED
            else:
                return CallState.IDLE
        except:
            return self.call_state


async def main():
    parser = argparse.ArgumentParser(description="Rolex Telecom Windows Agent")
    parser.add_argument("--server", default="ws://72.56.236.204:3000/ws")
    parser.add_argument("--device", default="57NvLjFgq4")
    args = parser.parse_args()

    screen_w = ctypes.windll.user32.GetSystemMetrics(0)
    screen_h = ctypes.windll.user32.GetSystemMetrics(1)

    print("=" * 50)
    print("  Rolex Telecom - Windows Agent")
    print("=" * 50)
    print(f"  Server:  {args.server}")
    print(f"  Device:  {args.device}")
    print(f"  Screen:  {screen_w}x{screen_h}")
    print(f"  Call:    ({int(screen_w*CALL_BTN_X)}, {int(screen_h*CALL_BTN_Y)})")
    print(f"  Hangup:  ({int(screen_w*HANGUP_BTN_X)}, {int(screen_h*HANGUP_BTN_Y)})")
    print("=" * 50)

    agent = RolexAgent(args.server, args.device)
    try:
        await agent.connect()
    except KeyboardInterrupt:
        print("\nShutting down...")
        agent.running = False


if __name__ == "__main__":
    asyncio.run(main())
