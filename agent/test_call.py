"""
Simple: hover mouse over green Call button, press Enter.
Then it clicks and remembers the position.
"""
import ctypes
import ctypes.wintypes
import time
import sys
import os

try:
    ctypes.windll.user32.SetProcessDPIAware()
except:
    pass

number = sys.argv[1] if len(sys.argv) > 1 else "84957772424"

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

def get_mouse_pos():
    pt = ctypes.wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y

def click(x, y):
    ctypes.windll.user32.SetCursorPos(int(x), int(y))
    time.sleep(0.1)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.05)
    ctypes.windll.user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

print("=" * 50)
print("  STEP 1: Open Phone Link with number")
print("=" * 50)
os.startfile(f"tel:{number}")
print(f"  Opened tel:{number}")
print(f"  Wait for Phone Link to show the number...")
time.sleep(4)

print()
print("=" * 50)
print("  STEP 2: Find the green CALL button")
print("=" * 50)
print()
print("  >>> Move your mouse ON TOP of the GREEN")
print("  >>> call button in Phone Link and press ENTER")
print()
input("  [Press ENTER when mouse is on the button] ")

call_x, call_y = get_mouse_pos()
print(f"\n  CALL BUTTON position: ({call_x}, {call_y})")
print(f"  Clicking...")
click(call_x, call_y)
time.sleep(2)

ok = input("\n  Did the call start? (y/n): ").strip().lower()
if ok == "y":
    print(f"\n  SUCCESS! Call button is at ({call_x}, {call_y})")
    print(f"\n  Now find the HANGUP button...")
    print(f"  >>> Move mouse to the RED hangup button and press ENTER")
    input("  [Press ENTER when mouse is on hangup button] ")
    
    hup_x, hup_y = get_mouse_pos()
    print(f"\n  HANGUP BUTTON position: ({hup_x}, {hup_y})")
    
    yn = input("  Click hangup? (y/n): ").strip().lower()
    if yn == "y":
        click(hup_x, hup_y)
    
    print(f"\n{'=' * 50}")
    print(f"  RESULTS - save these!")
    print(f"{'=' * 50}")
    print(f"  Screen:  1920x1080")
    print(f"  CALL:    ({call_x}, {call_y})")
    print(f"  HANGUP:  ({hup_x}, {hup_y})")
    print(f"{'=' * 50}")
else:
    print(f"\n  Position ({call_x}, {call_y}) didn't work.")
    print(f"  Try again — hover over green button and press Enter")
    input("  [Press ENTER] ")
    
    call_x, call_y = get_mouse_pos()
    print(f"  Trying ({call_x}, {call_y})...")
    click(call_x, call_y)

input("\nPress Enter to exit...")
