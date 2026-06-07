"""
Rolex Telecom — Windows Agent
Controls Phone Link via UI automation + tel: protocol.

Usage:
    python rolex_agent.py [--server URL] [--device DEVICE_ID]

Default:
    --server ws://72.56.236.204:3000/ws
    --device 57NvLjFgq4
"""

import asyncio
import json
import subprocess
import time
import sys
import os
import argparse
import ssl
from enum import Enum

try:
    import websockets
except ImportError:
    print("[ERROR] websockets not installed. Run: pip install websockets")
    sys.exit(1)

# UI Automation
try:
    from pywinauto import Application, Desktop
    from pywinauto.findwindows import ElementNotFoundError
    from pywinauto.keyboard import send_keys
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False
    print("[WARN] pywinauto not installed — UI automation disabled")
    print("       Install: pip install pywinauto")

# Win32 for window monitoring
try:
    import win32gui
    import win32con
    HAS_WIN32GUI = True
except ImportError:
    HAS_WIN32GUI = False
    print("[WARN] pywin32 not installed — window monitoring disabled")
    print("       Install: pip install pywin32")


class CallState(Enum):
    IDLE = "idle"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTED = "connected"
    INCOMING = "incoming"


class RolexAgent:
    """Windows agent that controls Phone Link and reports to the server."""

    # Phone Link window titles (RU + EN)
    CALL_TITLES = [
        "Звонок на компьютере",
        "Звонок на мобильном устройстве",
        "Связь с телефоном",
        "Phone Link",
        "Your Phone",
        "Call on computer",
    ]

    INCOMING_KEYWORDS = ["входящий", "incoming"]

    CALL_KEYWORDS = [
        "звонок на компьютере", "call on computer",
        "звонок на мобильном", "call on mobile",
    ]

    def __init__(self, server_url, device_id):
        self.server_url = server_url
        self.device_id = device_id
        self.ws = None
        self.call_state = CallState.IDLE
        self.current_number = ""
        self.call_start_time = None
        self.running = True
        self.reconnect_delay = 3
        self.dialed_digits = ""

        # SSL context for wss:// connections
        self.ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE

    async def connect(self):
        """Connect to WebSocket server with auto-reconnect."""
        url = f"{self.server_url}?type=agent&id={self.device_id}"
        use_ssl = self.server_url.startswith("wss://")

        while self.running:
            try:
                print(f"\n[CONN] Connecting to {self.server_url}...")
                connect_kwargs = {
                    "uri": url,
                    "ping_interval": 20,
                    "ping_timeout": 10,
                    "close_timeout": 5,
                }
                if use_ssl:
                    connect_kwargs["ssl"] = self.ssl_ctx

                async with websockets.connect(**connect_kwargs) as ws:
                    self.ws = ws
                    self.reconnect_delay = 3
                    print(f"[OK] Connected! Device: {self.device_id}")
                    print(f"[OK] Waiting for commands...\n")

                    # Send online status
                    await self.send({
                        "type": "phone_status",
                        "status": "online",
                        "battery": 100,
                        "signal": 4,
                    })

                    # Start monitoring task
                    monitor_task = asyncio.create_task(self.monitor_phone_link())
                    # Start ping task
                    ping_task = asyncio.create_task(self.ping_loop())

                    try:
                        async for message in ws:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        print("[CONN] Connection lost")
                    finally:
                        monitor_task.cancel()
                        ping_task.cancel()
                        self.ws = None

            except Exception as e:
                print(f"[ERROR] Connection failed: {e}")

            if self.running:
                print(f"[CONN] Reconnecting in {self.reconnect_delay}s...")
                await asyncio.sleep(self.reconnect_delay)
                self.reconnect_delay = min(30, self.reconnect_delay * 2)

    async def ping_loop(self):
        """Send periodic pings to keep connection alive."""
        while True:
            try:
                await asyncio.sleep(15)
                await self.send({"type": "ping"})
            except asyncio.CancelledError:
                break
            except:
                pass

    async def handle_message(self, raw):
        """Handle incoming commands from the web UI."""
        try:
            msg = json.loads(raw)
            cmd = msg.get("type", "")

            if cmd == "pong":
                return  # Server pong, ignore

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
                self.dialed_digits += key

            elif cmd == "dtmf":
                key = msg.get("key", "")
                print(f"[CMD] DTMF: {key}")
                self._send_dtmf(key)

            elif cmd == "mute":
                enabled = msg.get("enabled", False)
                print(f"[CMD] MUTE: {'ON' if enabled else 'OFF'}")
                self._toggle_button_by_name(["Мик", "Mute", "Unmute", "Микрофон"])

            elif cmd == "hold":
                enabled = msg.get("enabled", False)
                print(f"[CMD] HOLD: {'ON' if enabled else 'OFF'}")
                self._toggle_button_by_name(["Удержание", "Hold", "Удерж"])

            elif cmd == "speaker":
                enabled = msg.get("enabled", False)
                print(f"[CMD] SPEAKER: {'ON' if enabled else 'OFF'}")
                self._toggle_button_by_name(["Динамик", "Speaker", "Громк"])

            else:
                if cmd not in ("connected", "agent_status"):
                    print(f"[CMD] Unknown: {cmd}")

        except json.JSONDecodeError:
            print(f"[ERROR] Parse error: {raw[:100]}")

    async def send(self, msg):
        """Send a message to the server."""
        if self.ws:
            try:
                await self.ws.send(json.dumps(msg))
            except Exception as e:
                print(f"[ERROR] Send failed: {e}")

    # =============================================
    # CALL CONTROL
    # =============================================

    async def make_call(self, number):
        """Initiate a call via tel: protocol → Phone Link."""
        self.current_number = number
        self.call_state = CallState.DIALING
        self.dialed_digits = ""

        # Clean number
        clean = number.strip().replace(" ", "").replace("-", "")

        try:
            # Use tel: protocol — Windows will route to Phone Link
            os.startfile(f"tel:{clean}")
            print(f"  -> Opened tel:{clean}")

            # Wait for Phone Link to open, then auto-click Call button
            await asyncio.sleep(2)
            self._click_call_button()

            await self.send({
                "type": "call_status",
                "status": "ringing",
                "number": number,
            })
            self.call_state = CallState.RINGING

        except Exception as e:
            print(f"  [ERROR] {e}")
            await self.send({
                "type": "call_status",
                "status": "ended",
                "number": number,
            })
            self.call_state = CallState.IDLE

    async def hangup_call(self):
        """End the current call."""
        hung_up = False

        if HAS_PYWINAUTO:
            hung_up = self._click_button_by_name([
                "Отклонить", "Завершить", "Завершить звонок",
                "End call", "Decline", "Reject", "Hang up",
            ])

        if not hung_up:
            print("  -> Button not found, trying fallback...")
            # Fallback: Alt+F4 on call window, or send Escape
            self._focus_call_window()
            if HAS_PYWINAUTO:
                try:
                    send_keys("{ESC}")
                except:
                    pass

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
        self.dialed_digits = ""
        print(f"  -> Call ended (duration: {duration}s)")

    async def answer_call(self):
        """Answer an incoming call."""
        answered = False

        if HAS_PYWINAUTO:
            answered = self._click_button_by_name([
                "Принять", "Ответить", "Accept", "Answer",
            ])

        if not answered:
            print("  -> Answer button not found, trying notification...")
            # Try clicking notification toast
            if HAS_PYWINAUTO:
                try:
                    desktop = Desktop(backend="uia")
                    # Windows notification for incoming call
                    notifs = desktop.windows(title_re=".*входящ.*|.*incoming.*|.*Связь.*|.*Phone.*", visible_only=True)
                    for notif in notifs:
                        buttons = notif.descendants(control_type="Button")
                        for btn in buttons:
                            name = btn.window_text().lower()
                            if any(kw in name for kw in ["прин", "отв", "accept", "answer"]):
                                btn.click_input()
                                answered = True
                                print(f"  -> Clicked notification: {btn.window_text()}")
                                break
                        if answered:
                            break
                except Exception as e:
                    print(f"  -> Notification search failed: {e}")

        self.call_state = CallState.CONNECTED
        self.call_start_time = time.time()

        await self.send({
            "type": "call_status",
            "status": "connected",
            "number": self.current_number,
        })
        print(f"  -> Call answered")

    # =============================================
    # UI AUTOMATION HELPERS
    # =============================================

    def _find_call_window(self):
        """Find the Phone Link call window."""
        if not HAS_PYWINAUTO:
            return None

        try:
            desktop = Desktop(backend="uia")
            for title in self.CALL_TITLES:
                try:
                    windows = desktop.windows(title_re=f".*{title}.*", visible_only=True)
                    if windows:
                        return windows[0]
                except:
                    continue

            # Try by class name
            try:
                windows = desktop.windows(class_name_re=".*PhoneLink.*", visible_only=True)
                if windows:
                    return windows[0]
            except:
                pass

        except Exception as e:
            print(f"  [WARN] Window search error: {e}")
        return None

    def _focus_call_window(self):
        """Bring the call window to front."""
        if not HAS_WIN32GUI:
            return

        try:
            def enum_cb(hwnd, _):
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                title = win32gui.GetWindowText(hwnd).lower()
                for kw in self.CALL_KEYWORDS:
                    if kw in title:
                        try:
                            win32gui.SetForegroundWindow(hwnd)
                        except:
                            pass
                        return False
                return True
            win32gui.EnumWindows(enum_cb, None)
        except:
            pass

    def _click_button_by_name(self, names):
        """Find and click a button by name in the call window."""
        win = self._find_call_window()
        if not win:
            return False

        # Try exact match first
        for name in names:
            try:
                btn = win.child_window(title_re=f".*{name}.*", control_type="Button")
                if btn.exists(timeout=1):
                    btn.click_input()
                    print(f"  -> Clicked: {name}")
                    return True
            except:
                continue

        # Fallback: scan all buttons
        try:
            buttons = win.descendants(control_type="Button")
            name_lower_list = [n.lower() for n in names]
            for btn in buttons:
                btn_text = btn.window_text().lower()
                for name_l in name_lower_list:
                    if name_l.lower()[:4] in btn_text:
                        btn.click_input()
                        print(f"  -> Clicked (fuzzy): {btn.window_text()}")
                        return True
        except:
            pass

        return False

    def _toggle_button_by_name(self, names):
        """Toggle a button (mute, hold, speaker) in call window."""
        result = self._click_button_by_name(names)
        if not result:
            print(f"  -> Button not found: {names[0]}")

    def _click_call_button(self):
        """Click the Call/Dial button in Phone Link after tel: opens."""
        if not HAS_PYWINAUTO:
            return

        try:
            desktop = Desktop(backend="uia")
            # Phone Link dialer might show a confirmation dialog
            for title in self.CALL_TITLES:
                try:
                    windows = desktop.windows(title_re=f".*{title}.*", visible_only=True)
                    for win in windows:
                        call_names = ["Позвонить", "Вызов", "Call", "Dial"]
                        for name in call_names:
                            try:
                                btn = win.child_window(title_re=f".*{name}.*", control_type="Button")
                                if btn.exists(timeout=1):
                                    btn.click_input()
                                    print(f"  -> Clicked call button: {name}")
                                    return
                            except:
                                continue
                except:
                    continue
        except Exception as e:
            print(f"  -> Call button search failed: {e}")

    def _send_dtmf(self, key):
        """Send DTMF tone during active call by clicking keypad in Phone Link."""
        if not HAS_PYWINAUTO:
            return

        win = self._find_call_window()
        if not win:
            print(f"  -> No call window for DTMF")
            return

        try:
            # Try to find and click the DTMF key button
            btn = win.child_window(title_re=f".*{key}.*", control_type="Button")
            if btn.exists(timeout=1):
                btn.click_input()
                print(f"  -> DTMF sent: {key}")
                return
        except:
            pass

        # Fallback: type the key
        try:
            self._focus_call_window()
            send_keys(key, pause=0.05)
            print(f"  -> DTMF typed: {key}")
        except:
            print(f"  -> DTMF failed: {key}")

    # =============================================
    # CALL STATE MONITORING
    # =============================================

    async def monitor_phone_link(self):
        """Periodically check Phone Link state for call changes."""
        last_state = CallState.IDLE

        while True:
            try:
                await asyncio.sleep(1.5)

                if not HAS_WIN32GUI:
                    continue

                current = self._detect_call_state()

                if current != last_state:
                    print(f"[STATE] {last_state.value} -> {current.value}")

                    if current == CallState.INCOMING and last_state == CallState.IDLE:
                        incoming_number = self._get_incoming_number()
                        self.current_number = incoming_number
                        self.call_state = CallState.INCOMING

                        await self.send({
                            "type": "incoming_call",
                            "number": incoming_number,
                        })
                        print(f"  -> Incoming call: {incoming_number}")

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
            except Exception:
                pass

    def _detect_call_state(self):
        """Detect current call state by checking Phone Link windows."""
        if not HAS_WIN32GUI:
            return self.call_state

        try:
            call_window_found = False
            incoming_found = False

            def enum_callback(hwnd, _):
                nonlocal call_window_found, incoming_found
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                title = win32gui.GetWindowText(hwnd).lower()

                for kw in self.INCOMING_KEYWORDS:
                    if kw in title:
                        incoming_found = True

                for kw in self.CALL_KEYWORDS:
                    if kw in title:
                        call_window_found = True

                return True

            win32gui.EnumWindows(enum_callback, None)

            if incoming_found:
                return CallState.INCOMING
            elif call_window_found:
                if self.call_state in (CallState.DIALING, CallState.RINGING):
                    return CallState.RINGING
                return CallState.CONNECTED
            else:
                return CallState.IDLE

        except Exception:
            return self.call_state

    def _get_incoming_number(self):
        """Try to extract the incoming call number from Phone Link UI."""
        if not HAS_PYWINAUTO:
            return "Unknown"

        try:
            win = self._find_call_window()
            if win:
                texts = win.descendants(control_type="Text")
                for t in texts:
                    text = t.window_text().strip()
                    digits = ''.join(c for c in text if c.isdigit() or c in '+-()')
                    if len(digits) >= 7:
                        return text
        except:
            pass

        return "Unknown"


async def main():
    parser = argparse.ArgumentParser(description="Rolex Telecom Windows Agent")
    parser.add_argument("--server", default="ws://72.56.236.204:3000/ws",
                        help="WebSocket server URL")
    parser.add_argument("--device", default="57NvLjFgq4",
                        help="Device ID")
    args = parser.parse_args()

    print("=" * 50)
    print("  Rolex Telecom - Windows Agent")
    print("=" * 50)
    print(f"  Server:    {args.server}")
    print(f"  Device:    {args.device}")
    print(f"  win32gui:  {'YES' if HAS_WIN32GUI else 'NO'}")
    print(f"  pywinauto: {'YES' if HAS_PYWINAUTO else 'NO'}")
    print("=" * 50)

    agent = RolexAgent(args.server, args.device)

    try:
        await agent.connect()
    except KeyboardInterrupt:
        print("\nShutting down...")
        agent.running = False


if __name__ == "__main__":
    asyncio.run(main())
