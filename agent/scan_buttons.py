"""
Find Bluetooth HFP COM port and test AT commands.
This bypasses Phone Link UI entirely!
"""
import subprocess
import sys
import time

# Method 1: List COM ports via PowerShell
print("=" * 50)
print("  Scanning Bluetooth COM ports...")
print("=" * 50)

ps_script = '''
# List all COM ports
Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "COM" -and $_.Name -match "Bluetooth|Standard Serial|Phone" } | ForEach-Object {
    Write-Output "PORT: $($_.Name) | DeviceID: $($_.DeviceID)"
}

Write-Output ""
Write-Output "--- All COM ports ---"
[System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object {
    Write-Output "  $_"
}
'''

result = subprocess.run(
    ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
    capture_output=True, text=True, timeout=10
)
print(result.stdout)
if result.stderr:
    print("Errors:", result.stderr[:300])

# Method 2: Try to find HFP port via registry
print("\n" + "=" * 50)
print("  Checking Bluetooth HFP in registry...")
print("=" * 50)

ps_reg = '''
# Check Bluetooth COM ports in registry
$btPorts = Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\BTHENUM\\*\\*\\*" -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match "COM|Serial|Hands" }
foreach ($p in $btPorts) {
    Write-Output "  $($p.FriendlyName) | $($p.PSPath)"
}

# Also check current serial ports
Write-Output ""
Write-Output "--- Device Manager COM ports ---"
Get-CimInstance Win32_SerialPort | ForEach-Object {
    Write-Output "  $($_.DeviceID): $($_.Description) [$($_.Name)]"
}

# PnP for Bluetooth
Write-Output ""
Write-Output "--- Bluetooth devices ---"
Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "OK" } | ForEach-Object {
    Write-Output "  $($_.FriendlyName) [$($_.InstanceId)]"
}
'''

result2 = subprocess.run(
    ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_reg],
    capture_output=True, text=True, timeout=10
)
print(result2.stdout)

# Try pyserial if available
print("\n" + "=" * 50)
print("  Testing COM ports with pyserial...")
print("=" * 50)

try:
    import serial
    import serial.tools.list_ports

    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        print(f"  {p.device}: {p.description} [hwid={p.hwid}]")
        if "bluetooth" in p.description.lower() or "bth" in p.hwid.lower():
            print(f"    ^^^ BLUETOOTH PORT FOUND!")
except ImportError:
    print("  pyserial not installed. Run: pip install pyserial")
    print("  (Optional — PowerShell results above should be enough)")

print("\n" + "=" * 50)
port = input("  Enter COM port to test (e.g. COM5), or 'q' to quit: ").strip()

if port.lower() == 'q' or not port:
    print("  Done.")
    input("Press Enter to exit...")
    sys.exit(0)

# Test AT commands on the port
print(f"\n  Testing AT commands on {port}...")

try:
    import serial
except ImportError:
    print("  Need pyserial! Run: pip install pyserial")
    input("Press Enter to exit...")
    sys.exit(1)

try:
    ser = serial.Serial(port, 9600, timeout=2)
    time.sleep(0.5)

    # Test basic AT command
    ser.write(b"AT\r\n")
    time.sleep(1)
    response = ser.read(ser.in_waiting).decode('utf-8', errors='replace')
    print(f"  AT response: {response.strip()}")

    if "OK" in response:
        print(f"\n  [SUCCESS] Port {port} responds to AT commands!")
        print(f"  This is your Bluetooth HFP port.")
        print(f"\n  Available commands:")
        print(f"    ATD<number>;  - Dial a number")
        print(f"    AT+CHUP       - Hang up")
        print(f"    ATA           - Answer call")
        print(f"    AT+CLCC       - List active calls")

        action = input("\n  Test dial? Enter phone number or 'q': ").strip()
        if action and action != 'q':
            cmd = f"ATD{action};\r\n"
            print(f"  Sending: {cmd.strip()}")
            ser.write(cmd.encode())
            time.sleep(2)
            resp = ser.read(ser.in_waiting).decode('utf-8', errors='replace')
            print(f"  Response: {resp.strip()}")
    else:
        print(f"  Port did not respond with OK. May not be HFP port.")

    ser.close()

except serial.SerialException as e:
    print(f"  [ERROR] Cannot open {port}: {e}")
except Exception as e:
    print(f"  [ERROR] {e}")

input("\nPress Enter to exit...")
