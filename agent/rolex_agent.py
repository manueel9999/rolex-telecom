"""
Rolex Telecom — Windows Agent
Controls Phone Link (Связь с телефоном) via UI automation.

Usage:
    python rolex_agent.py [--server URL] [--device DEVICE_ID]

Default:
    --server wss://72.56.236.204/ws
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
import ctypes
from enum import Enum

try:
    import websockets
except ImportError:
    print("❌ websockets не установлен. Запустите: pip install websockets")
    sys.exit(1)

# Try to import Windows-specific modules
try:
    import ctypes.wintypes
    HAS_WIN32 = True
except:
    HAS_WIN32 = False

# Phone Link window detection via win32gui
try:
    import win32gui
    import win32con
    import win32api
    import win32process
    HAS_WIN32GUI = True
except ImportError:
    HAS_WIN32GUI = False
    print("⚠️  pywin32 не установлен — мониторинг окон отключён")
    print("   Установите: pip install pywin32")

# UI Automation
try:
    from pywinauto import Application, Desktop
    from pywinauto.findwindows import ElementNotFoundError
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False
    print("⚠️  pywinauto не установлен — UI автоматизация отключена")
    print("   Установите: pip install pywinauto")


class CallState(Enum):
    IDLE = "idle"
    DIALING = "dialing"
    RINGING = "ringing"
    CONNECTED = "connected"
    INCOMING = "incoming"
    ENDING = "ending"


class RolexAgent:
    """
    Windows agent that controls Phone Link and reports to the server.
    """

    def __init__(self, server_url, device_id):
        self.server_url = server_url
        self.device_id = device_id
        self.ws = None
        self.call_state = CallState.IDLE
        self.current_number = ""
        self.call_start_time = None
        self.running = True
        self.reconnect_delay = 3

        # SSL context for self-signed certs
        self.ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE

    async def connect(self):
        """Connect to WebSocket server with auto-reconnect."""
        url = f"{self.server_url}?type=agent&id={self.device_id}"

        while self.running:
            try:
                print(f"\n🔌 Подключение к {self.server_url}...")
                async with websockets.connect(
                    url,
                    ssl=self.ssl_ctx,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self.ws = ws
                    self.reconnect_delay = 3
                    print(f"✅ Подключено! Устройство: {self.device_id}")
                    print(f"📡 Ожидание команд...\n")

                    # Start monitoring task
                    monitor_task = asyncio.create_task(self.monitor_phone_link())

                    try:
                        async for message in ws:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        print("🔴 Соединение потеряно")
                    finally:
                        monitor_task.cancel()
                        self.ws = None

            except Exception as e:
                print(f"❌ Ошибка подключения: {e}")

            if self.running:
                print(f"🔄 Переподключение через {self.reconnect_delay}с...")
                await asyncio.sleep(self.reconnect_delay)
                self.reconnect_delay = min(30, self.reconnect_delay * 2)

    async def handle_message(self, raw):
        """Handle incoming commands from the server."""
        try:
            msg = json.loads(raw)
            cmd = msg.get("type", "")

            if cmd == "call":
                number = msg.get("number", "")
                print(f"📞 Звонок: {number}")
                await self.make_call(number)

            elif cmd == "hangup":
                print(f"📵 Сброс звонка")
                await self.hangup_call()

            elif cmd == "answer":
                print(f"📲 Принять звонок")
                await self.answer_call()

            elif cmd == "dial":
                key = msg.get("key", "")
                print(f"🔢 DTMF: {key}")
                # DTMF during active call — not easily supported via Phone Link

            elif cmd == "mute":
                enabled = msg.get("enabled", False)
                print(f"🔇 Мут: {'ВКЛ' if enabled else 'ВЫКЛ'}")
                await self.toggle_mute()

            elif cmd == "hold":
                enabled = msg.get("enabled", False)
                print(f"⏸️  Удержание: {'ВКЛ' if enabled else 'ВЫКЛ'}")

            else:
                print(f"❓ Неизвестная команда: {cmd}")

        except json.JSONDecodeError:
            print(f"❌ Ошибка парсинга: {raw}")

    async def send(self, msg):
        """Send a message to the server."""
        if self.ws:
            try:
                await self.ws.send(json.dumps(msg))
            except Exception as e:
                print(f"❌ Ошибка отправки: {e}")

    # =============================================
    # CALL CONTROL
    # =============================================

    async def make_call(self, number):
        """Initiate a call via Phone Link using tel: protocol."""
        self.current_number = number
        self.call_state = CallState.DIALING

        # Clean number
        clean = number.strip().replace(" ", "").replace("-", "")
        if not clean.startswith("+"):
            clean = "+" + clean

        try:
            # Use tel: protocol — Windows will open Phone Link
            os.startfile(f"tel:{clean}")
            print(f"  → Открыт tel:{clean}")

            await self.send({
                "type": "call_status",
                "status": "ringing",
                "number": number,
            })
            self.call_state = CallState.RINGING

        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            await self.send({
                "type": "call_status",
                "status": "ended",
                "number": number,
            })
            self.call_state = CallState.IDLE

    async def hangup_call(self):
        """End the current call."""
        self.call_state = CallState.ENDING
        hung_up = False

        if HAS_PYWINAUTO:
            hung_up = self._hangup_via_ui()

        if not hung_up:
            # Fallback: try keyboard shortcut
            self._send_keys_hangup()

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
        print(f"  → Звонок завершён (длительность: {duration}с)")

    async def answer_call(self):
        """Answer an incoming call."""
        answered = False

        if HAS_PYWINAUTO:
            answered = self._answer_via_ui()

        if not answered:
            self._send_keys_answer()

        self.call_state = CallState.CONNECTED
        self.call_start_time = time.time()

        await self.send({
            "type": "call_status",
            "status": "connected",
            "number": self.current_number,
        })
        print(f"  → Звонок принят")

    async def toggle_mute(self):
        """Toggle mute in Phone Link."""
        if HAS_PYWINAUTO:
            self._toggle_mute_via_ui()

    # =============================================
    # UI AUTOMATION (Phone Link)
    # =============================================

    def _find_phone_link_call_window(self):
        """Find the Phone Link call popup window."""
        if not HAS_PYWINAUTO:
            return None

        try:
            desktop = Desktop(backend="uia")
            # Phone Link call windows — try different titles
            titles_to_try = [
                "Звонок на компьютере",
                "Звонок на мобильном устройстве",
                "Phone Link",
                "Связь с телефоном",
                "Your Phone",
            ]

            for title in titles_to_try:
                try:
                    windows = desktop.windows(title_re=f".*{title}.*", visible_only=True)
                    if windows:
                        return windows[0]
                except:
                    continue

            # Try to find by class name
            try:
                windows = desktop.windows(class_name_re=".*PhoneLink.*", visible_only=True)
                if windows:
                    return windows[0]
            except:
                pass

        except Exception as e:
            print(f"  ⚠️ UI поиск ошибка: {e}")

        return None

    def _hangup_via_ui(self):
        """Click the End Call button in Phone Link."""
        try:
            win = self._find_phone_link_call_window()
            if not win:
                print("  ⚠️ Окно Phone Link не найдено")
                return False

            # Try to find End Call / Reject / Завершить button
            button_names = [
                "Отклонить",
                "Завершить",
                "End call",
                "Decline",
                "Reject",
                "Hang up",
            ]

            for name in button_names:
                try:
                    btn = win.child_window(title_re=f".*{name}.*", control_type="Button")
                    if btn.exists(timeout=1):
                        btn.click_input()
                        print(f"  → Нажата кнопка: {name}")
                        return True
                except:
                    continue

            # Fallback: try to find the red button by automation id
            try:
                buttons = win.descendants(control_type="Button")
                for btn in buttons:
                    name = btn.window_text()
                    if any(kw in name.lower() for kw in ["завер", "откл", "end", "hang", "decline", "reject"]):
                        btn.click_input()
                        print(f"  → Нажата: {name}")
                        return True
            except:
                pass

            print("  ⚠️ Кнопка завершения не найдена")
            return False

        except Exception as e:
            print(f"  ❌ UI ошибка: {e}")
            return False

    def _answer_via_ui(self):
        """Click the Answer button in Phone Link."""
        try:
            win = self._find_phone_link_call_window()
            if not win:
                # Try notification area
                desktop = Desktop(backend="uia")
                try:
                    notif = desktop.window(title_re=".*входящ.*|.*incoming.*", visible_only=True)
                    if notif.exists():
                        win = notif
                except:
                    pass

            if not win:
                print("  ⚠️ Окно входящего звонка не найдено")
                return False

            button_names = [
                "Принять",
                "Ответить",
                "Accept",
                "Answer",
            ]

            for name in button_names:
                try:
                    btn = win.child_window(title_re=f".*{name}.*", control_type="Button")
                    if btn.exists(timeout=1):
                        btn.click_input()
                        print(f"  → Нажата: {name}")
                        return True
                except:
                    continue

            # Fallback
            try:
                buttons = win.descendants(control_type="Button")
                for btn in buttons:
                    name = btn.window_text()
                    if any(kw in name.lower() for kw in ["прин", "отв", "accept", "answer"]):
                        btn.click_input()
                        print(f"  → Нажата: {name}")
                        return True
            except:
                pass

            return False

        except Exception as e:
            print(f"  ❌ UI ошибка: {e}")
            return False

    def _toggle_mute_via_ui(self):
        """Toggle mute button in Phone Link call window."""
        try:
            win = self._find_phone_link_call_window()
            if not win:
                return

            mute_names = ["Мик", "Mute", "Unmute", "Микрофон"]
            for name in mute_names:
                try:
                    btn = win.child_window(title_re=f".*{name}.*", control_type="Button")
                    if btn.exists(timeout=1):
                        btn.click_input()
                        print(f"  → Мут переключён")
                        return
                except:
                    continue
        except:
            pass

    def _send_keys_hangup(self):
        """Fallback: try to end call via keyboard."""
        print("  → Попытка завершить через клавиатуру...")
        # Some Phone Link versions respond to Win+H or other shortcuts
        # This is a best-effort fallback

    def _send_keys_answer(self):
        """Fallback: try to answer call via keyboard."""
        print("  → Попытка ответить через клавиатуру...")

    # =============================================
    # CALL STATE MONITORING
    # =============================================

    async def monitor_phone_link(self):
        """Periodically check Phone Link state for call changes."""
        last_state = CallState.IDLE

        while True:
            try:
                await asyncio.sleep(1)  # Check every second

                if not HAS_WIN32GUI:
                    continue

                current = self._detect_call_state()

                if current != last_state:
                    print(f"📊 Статус: {last_state.value} → {current.value}")

                    if current == CallState.INCOMING and last_state == CallState.IDLE:
                        # Detected incoming call
                        incoming_number = self._get_incoming_number()
                        self.current_number = incoming_number
                        self.call_state = CallState.INCOMING

                        await self.send({
                            "type": "incoming_call",
                            "number": incoming_number,
                        })
                        print(f"  📲 Входящий звонок: {incoming_number}")

                    elif current == CallState.CONNECTED and last_state in (CallState.RINGING, CallState.DIALING, CallState.INCOMING):
                        # Call connected
                        self.call_state = CallState.CONNECTED
                        self.call_start_time = time.time()

                        await self.send({
                            "type": "call_status",
                            "status": "connected",
                            "number": self.current_number,
                        })

                    elif current == CallState.IDLE and last_state in (CallState.CONNECTED, CallState.RINGING, CallState.INCOMING):
                        # Call ended
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
            except Exception as e:
                # Don't crash the monitor on errors
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

                title = win32gui.GetWindowText(hwnd)
                title_lower = title.lower()

                # Check for active call window
                if any(kw in title_lower for kw in [
                    "звонок на компьютере",
                    "call on computer",
                    "звонок на мобильном",
                ]):
                    call_window_found = True

                # Check for incoming call
                if any(kw in title_lower for kw in [
                    "входящий",
                    "incoming",
                ]):
                    incoming_found = True

                return True

            win32gui.EnumWindows(enum_callback, None)

            if incoming_found:
                return CallState.INCOMING
            elif call_window_found:
                if self.call_state == CallState.DIALING or self.call_state == CallState.RINGING:
                    return CallState.RINGING
                return CallState.CONNECTED
            else:
                return CallState.IDLE

        except Exception:
            return self.call_state

    def _get_incoming_number(self):
        """Try to extract the incoming call number from Phone Link UI."""
        if not HAS_PYWINAUTO:
            return "Неизвестный"

        try:
            win = self._find_phone_link_call_window()
            if win:
                # Try to read text elements for phone number
                texts = win.descendants(control_type="Text")
                for t in texts:
                    text = t.window_text().strip()
                    # Look for something that looks like a phone number
                    digits = ''.join(c for c in text if c.isdigit() or c in '+-()')
                    if len(digits) >= 7:
                        return text
        except:
            pass

        return "Неизвестный"


async def main():
    parser = argparse.ArgumentParser(description="Rolex Telecom Windows Agent")
    parser.add_argument("--server", default="wss://72.56.236.204/ws",
                        help="WebSocket server URL")
    parser.add_argument("--device", default="57NvLjFgq4",
                        help="Device ID")
    args = parser.parse_args()

    print("=" * 50)
    print("  🏢 Rolex Telecom — Windows Agent")
    print("=" * 50)
    print(f"  Сервер:     {args.server}")
    print(f"  Устройство: {args.device}")
    print(f"  Win32GUI:   {'✅' if HAS_WIN32GUI else '❌'}")
    print(f"  pywinauto:  {'✅' if HAS_PYWINAUTO else '❌'}")
    print("=" * 50)

    agent = RolexAgent(args.server, args.device)

    try:
        await agent.connect()
    except KeyboardInterrupt:
        print("\n👋 Завершение...")
        agent.running = False


if __name__ == "__main__":
    asyncio.run(main())
