using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace rfid_bridge;

internal static class Program
{
    private static readonly object Sync = new();
    private static bool _connected;
    private static string _connectionMode = "none";
    private static bool _inventoryRunning;
    private static Thread? _readerThread;
    private static readonly HashSet<string> SeenTags = new(StringComparer.OrdinalIgnoreCase);
    private static int _unparsedTagFrameLogs;
    private static DateTime _readLoopStartedAt = DateTime.MinValue;
    private static bool _readLoopHintPrinted;

    /// <summary>Last successful TX attenuation (attDb10). Applied on connect, not before every scan.</summary>
    private static uint? _lastPowerAttDb10;
    private static readonly List<int> _deviceIds = new();

    private const byte CellConnectId = 1;
    private const byte CellUhfRssi = 4;
    private const byte CellUhfAntenna = 5;
    private const byte CellUhfEpc = 6;
    private const byte CellUhfTid = 7;
    private const byte CellUhfUser = 8;
    private const byte CellUhfPhase = 14;

    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        PrintHelp();

        while (true)
        {
            Console.Write("rfid> ");
            var line = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var args = line.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var command = args[0].ToLowerInvariant();

            try
            {
                switch (command)
                {
                    case "connect-tcp":
                        ConnectTcp(args);
                        break;
                    case "connect-usb":
                        ConnectUsb();
                        break;
                    case "connect-serial":
                        ConnectSerial(args);
                        break;
                    case "start":
                        StartInventory();
                        break;
                    case "stop":
                        StopInventory();
                        break;
                    case "disconnect":
                        Disconnect();
                        break;
                    case "status":
                        PrintStatus();
                        break;
                    case "devices":
                        PrintDevices();
                        break;
                    case "set-power":
                        SetPower(args);
                        break;
                    case "get-power":
                        GetPower();
                        break;
                    case "read-mem":
                        ReadTagMemory(args);
                        break;
                    case "write-mem":
                        WriteTagMemory(args);
                        break;
                    case "help":
                        PrintHelp();
                        break;
                    case "exit":
                        StopInventory();
                        Disconnect();
                        return 0;
                    default:
                        Console.WriteLine("Unknown command. Type 'help'.");
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ERROR: {ex.Message}");
            }
        }
    }

    private static void ConnectTcp(string[] args)
    {
        if (args.Length < 3)
        {
            Console.WriteLine("Usage: connect-tcp <ip> <port>");
            return;
        }

        if (!uint.TryParse(args[2], out var port))
        {
            Console.WriteLine("Invalid port.");
            return;
        }

        StopInventory();
        lock (Sync)
        {
            if (_connected && _connectionMode != "tcp")
            {
                EnsureDisconnected();
            }
            var ip = new StringBuilder(args[1]);
            var result = NativeMethods.TCPConnect(ip, port);
            if (result == 0)
            {
                _connected = true;
                _connectionMode = "tcp";
                Console.WriteLine("Connected via TCP.");
            }
            else
            {
                Console.WriteLine($"TCP connect failed (code={result}).");
            }
        }
    }

    private static string DescribeUsbOpenError(int code) => code switch
    {
        0 => "OK",
        1 => "Generic failure",
        2 => "Invalid parameter",
        3 => "Device busy / already open in another app",
        4 => "Permission denied",
        5 => "Device not found (reader unplugged or wrong driver)",
        6 => "ERR_OPEN_USB_FAILURE — no compatible USB reader found (tray may be a virtual COM port; try connect-serial)",
        7 => "Driver or libusb not ready",
        _ => "See vendor UHFAPI.dll documentation for this return code"
    };

    private static void ConnectUsb()
    {
        StopInventory();
        lock (Sync)
        {
            EnsureDisconnected();
            var result = NativeMethods.UsbOpen();
            _connected = result == 0;
            _connectionMode = _connected ? "usb" : "none";
            if (_connected)
            {
                ApplyReaderScanDefaults();
                Console.WriteLine("Connected via USB.");
                var devices = GetConnectedDevices();
                RememberDeviceIds(devices);
                Console.WriteLine($"Connected devices detected by SDK: {devices.Count}");
            }
            else
            {
                Console.WriteLine($"USB connect failed (code={result}). {DescribeUsbOpenError(result)}");
                Console.WriteLine("Hint: If Windows shows the tray as COM3/COM7 in Device Manager, use connect-serial instead of connect-usb.");
            }
        }
    }

    private static void ConnectSerial(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("Usage: connect-serial <comNumber> [baud]");
            return;
        }

        if (!int.TryParse(args[1], out var comNumber))
        {
            Console.WriteLine("Invalid COM number.");
            return;
        }

        var baud = 115200;
        if (args.Length >= 3 && !int.TryParse(args[2], out baud))
        {
            Console.WriteLine("Invalid baudrate.");
            return;
        }

        StopInventory();
        lock (Sync)
        {
            if (_connected && _connectionMode != "serial")
            {
                EnsureDisconnected();
            }

            // Multi-device serial in vendor SDK commonly uses ComOpen(com),
            // while ComOpenWithBaud can behave as single-link on some firmware.
            var result = NativeMethods.ComOpen(comNumber);
            if (result != 0)
            {
                result = NativeMethods.ComOpenWithBaud(comNumber, baud);
            }

            if (result == 0)
            {
                _connected = true;
                _connectionMode = "serial";
                ApplyReaderScanDefaults();
                Console.WriteLine($"Connected via Serial COM{comNumber}.");
                var devices = GetConnectedDevices();
                RememberDeviceIds(devices);
                Console.WriteLine($"Connected devices detected by SDK: {devices.Count}");
            }
            else
            {
                Console.WriteLine($"Serial connect failed (code={result}).");
            }
        }
    }

    /// <summary>
    /// Vendor SDKs apply RF output at inventory start; re-applying here guarantees the last UI power
    /// is in effect even if the reader ignored an earlier set-power or firmware reset parameters.
    /// </summary>
    private static void ApplyStoredPowerBeforeInventory()
    {
        if (_lastPowerAttDb10 is not uint att)
        {
            return;
        }

        if (!UhfPowerInterop.TrySetPower(att, out var rc, out _))
        {
            return;
        }

        if (!UhfPowerInterop.IsPowerReturnOk(rc))
        {
            Console.WriteLine($"WARN: TX power re-apply before inventory failed (code={rc}).");
            return;
        }

        Console.WriteLine($"INFO: TX power attDb10={att} applied immediately before inventory.");
    }

    private static void ApplyReaderScanDefaults()
    {
        try
        {
            // Enable EPC + TID in inventory responses (non-fatal if unsupported).
            NativeMethods.UHFSetEPCTIDMode(0, 1);
        }
        catch
        {
            // optional
        }

        if (_lastPowerAttDb10 is null)
        {
            _lastPowerAttDb10 = 0;
        }

        try
        {
            var att = _lastPowerAttDb10.Value;
            if (UhfPowerInterop.TrySetPower(att, out var rc, out _) && UhfPowerInterop.IsPowerReturnOk(rc))
            {
                Console.WriteLine(
                    $"INFO: TX power attDb10={att} ({UhfPowerInterop.AttDb10ToDbm(att)} dBm) applied on connect.");
            }
        }
        catch
        {
            // optional
        }
    }

    private static void StartInventory()
    {
        lock (Sync)
        {
            if (!_connected)
            {
                Console.WriteLine("Not connected.");
                return;
            }

            if (_inventoryRunning)
            {
                Console.WriteLine("Inventory already running.");
                return;
            }

            var startedDevices = 0;
            var ids = _deviceIds.Count > 0 ? _deviceIds : new List<int>();

            // USB trays often need UHFInventory(); multi-COM setups use UHFInventoryById per link.
            if (string.Equals(_connectionMode, "usb", StringComparison.OrdinalIgnoreCase))
            {
                var usbResult = NativeMethods.UHFInventory();
                Console.WriteLine($"INFO: UHFInventory() returned {usbResult}");
                if (usbResult == 0)
                {
                    startedDevices = 1;
                }
                else if (ids.Count > 0)
                {
                    foreach (var id in ids)
                    {
                        var idResult = NativeMethods.UHFInventoryById(id);
                        Console.WriteLine($"INFO: UHFInventoryById({id}) returned {idResult}");
                        if (idResult == 0)
                        {
                            startedDevices++;
                        }
                    }
                }
            }
            else if (ids.Count > 0)
            {
                foreach (var id in ids)
                {
                    var idResult = NativeMethods.UHFInventoryById(id);
                    Console.WriteLine($"INFO: UHFInventoryById({id}) returned {idResult}");
                    if (idResult == 0)
                    {
                        startedDevices++;
                    }
                }

                if (startedDevices == 0)
                {
                    var fallback = NativeMethods.UHFInventory();
                    Console.WriteLine($"INFO: UHFInventory() fallback returned {fallback}");
                    if (fallback == 0)
                    {
                        startedDevices = 1;
                    }
                }
            }
            else
            {
                var result = NativeMethods.UHFInventory();
                Console.WriteLine($"INFO: UHFInventory() returned {result}");
                if (result == 0)
                {
                    startedDevices = 1;
                }
            }

            if (startedDevices == 0)
            {
                Console.WriteLine("Start inventory failed for all connected devices.");
                return;
            }

            SeenTags.Clear();
            _unparsedTagFrameLogs = 0;
            _readLoopHintPrinted = false;
            _readLoopStartedAt = DateTime.UtcNow;
            _inventoryRunning = true;
            _readerThread = new Thread(ReadLoop) { IsBackground = true };
            _readerThread.Start();
            Console.WriteLine($"Inventory started on {startedDevices} device(s) (continuous fast scan — all valid tags reported).");
        }
    }

    private static void StopInventory()
    {
        lock (Sync)
        {
            if (!_inventoryRunning)
            {
                return;
            }

            _inventoryRunning = false;
            var ids = _deviceIds;
            var stopOk = 0;
            if (ids.Count > 0)
            {
                foreach (var id in ids)
                {
                    if (NativeMethods.UHFStopById(id) == 0)
                    {
                        stopOk++;
                    }
                }
            }

            var result = NativeMethods.UHFStopGet();
            if (ids.Count > 0)
            {
                Console.WriteLine($"Inventory stop requested for {stopOk}/{ids.Count} device(s).");
            }
            else
            {
                Console.WriteLine(result == 0 ? "Inventory stopped." : $"Stop inventory returned code={result}.");
            }
        }

        _readerThread?.Join(40);
        _readerThread = null;

        var totalTags = 0;
        lock (Sync)
        {
            totalTags = SeenTags.Count;
        }

        if (totalTags > 0)
        {
            Console.WriteLine($"INFO: scan finished — {totalTags} unique tags collected.");
        }
    }

    private static void Disconnect()
    {
        lock (Sync)
        {
            StopInventory();
            EnsureDisconnected();
            Console.WriteLine("Disconnected.");
        }
    }

    private static void EnsureDisconnected()
    {
        if (!_connected)
        {
            return;
        }

        NativeMethods.LinkCloseAll();
        NativeMethods.TCPDisconnect();
        NativeMethods.UsbClose();
        NativeMethods.ClosePort();

        _connected = false;
        _connectionMode = "none";
        _lastPowerAttDb10 = null;
        _deviceIds.Clear();
    }

    private static void PrintStatus()
    {
        lock (Sync)
        {
            Console.WriteLine($"connected={_connected}, mode={_connectionMode}, inventory={_inventoryRunning}");
        }
    }

    private static void PrintDevices()
    {
        var devices = GetConnectedDevices();
        if (devices.Count == 0)
        {
            Console.WriteLine("No connected devices found.");
            return;
        }

        foreach (var d in devices)
        {
            Console.WriteLine($"device id={d.Id} type={d.Type} ip={d.Ip} port={d.Port}");
        }
    }

    private static void PrintHelp()
    {
        Console.WriteLine("Commands:");
        Console.WriteLine("  connect-tcp <ip> <port>");
        Console.WriteLine("  connect-usb");
        Console.WriteLine("  connect-serial <comNumber> <baud>");
        Console.WriteLine("  set-power <0-300>   (UHFAPI attenuation: 0=max TX, higher=weaker; requires matching SDK exports)");
        Console.WriteLine("  get-power");
        Console.WriteLine("  read-mem <token> <epcHex> <bank> <wordPtr> <wordCount> [accessPwdHex]");
        Console.WriteLine("  write-mem <token> <epcHex> <bank> <wordPtr> <dataHex> [accessPwdHex]");
        Console.WriteLine("    bank = epc | tid | user | res");
        Console.WriteLine("  start");
        Console.WriteLine("  stop");
        Console.WriteLine("  disconnect");
        Console.WriteLine("  status");
        Console.WriteLine("  devices");
        Console.WriteLine("  help");
        Console.WriteLine("  exit");
    }

    private static void SetPower(string[] args)
    {
        if (args.Length < 2 || !uint.TryParse(args[1], out var att) || att > 300)
        {
            Console.WriteLine("Usage: set-power <0-300>");
            return;
        }

        lock (Sync)
        {
            if (!_connected)
            {
                Console.WriteLine("Not connected.");
                return;
            }

            try
            {
                if (!UhfPowerInterop.TrySetPower(att, out var rc, out var detail))
                {
                    Console.WriteLine($"ERROR: {detail ?? "set-power failed."}");
                    return;
                }

                if (UhfPowerInterop.IsPowerReturnOk(rc))
                {
                    _lastPowerAttDb10 = att;
                    Console.WriteLine($"POWER attDb10={att} ({UhfPowerInterop.AttDb10ToDbm(att)} dBm)");
                }
                else
                {
                    Console.WriteLine($"WARN: set-power returned code={rc}. Inventory can still run on the reader's default RF level.");
                }
            }
            catch (DllNotFoundException ex)
            {
                Console.WriteLine($"ERROR: {ex.Message}");
            }
        }
    }

    private static void GetPower()
    {
        lock (Sync)
        {
            if (!_connected)
            {
                Console.WriteLine("Not connected.");
                return;
            }

            try
            {
                if (!UhfPowerInterop.TryGetPower(out var att, out var rc, out var detail))
                {
                    Console.WriteLine($"ERROR: {detail ?? "get-power failed."}");
                    return;
                }

                if (UhfPowerInterop.IsPowerReturnOk(rc))
                {
                    _lastPowerAttDb10 = att;
                    Console.WriteLine($"POWER attDb10={att} ({UhfPowerInterop.AttDb10ToDbm(att)} dBm)");
                }
                else
                {
                    Console.WriteLine($"ERROR: get-power returned code={rc}.");
                }
            }
            catch (DllNotFoundException ex)
            {
                Console.WriteLine($"ERROR: {ex.Message}");
            }
        }
    }

    private static byte ResolveMemoryBank(string name)
    {
        return name.Trim().ToLowerInvariant() switch
        {
            "res" or "reserved" or "0" => 0,
            "epc" or "1" => 1,
            "tid" or "2" => 2,
            "user" or "usr" or "3" => 3,
            _ => throw new InvalidOperationException("Bank must be epc, tid, user, or res.")
        };
    }

    /// <summary>
    /// UHFWriteData writes whole words (2 bytes, 4 hex chars).
    /// Keep the hexcode as given and append 0 only until the length is a multiple of 4.
    /// </summary>
    private static byte[] ParseWriteWords(string hex)
    {
        var text = (hex ?? "").Trim();
        if (text.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            text = text[2..];
        }

        text = text.Replace(" ", string.Empty).ToUpperInvariant();
        if (text.Length == 0)
        {
            throw new InvalidOperationException("Write data is empty.");
        }

        foreach (var ch in text)
        {
            if (ch is < '0' or > '9' and < 'A' or > 'F')
            {
                throw new InvalidOperationException("Write data must be hex.");
            }
        }

        while (text.Length % 4 != 0)
        {
            text += "0";
        }

        if (text.Length / 2 > 64)
        {
            throw new InvalidOperationException("Write data must be 2-64 bytes.");
        }

        return ParseHexBytes(text, "Write data");
    }

    private static byte[] WithEpcPc(byte[] epcData)
    {
        var words = epcData.Length / 2;
        if (words < 1 || words > 31)
        {
            return epcData;
        }

        var framed = new byte[epcData.Length + 2];
        framed[0] = (byte)((words << 3) & 0xF8);
        framed[1] = 0;
        Buffer.BlockCopy(epcData, 0, framed, 2, epcData.Length);
        return framed;
    }

    private static byte[] ParseHexBytes(string hex, string label)
    {
        var text = (hex ?? "").Trim();
        if (text.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            text = text[2..];
        }

        if (text.Length == 0 || text.Length % 2 != 0)
        {
            throw new InvalidOperationException($"{label} must be even-length hex.");
        }

        var bytes = new byte[text.Length / 2];
        for (var i = 0; i < bytes.Length; i++)
        {
            bytes[i] = Convert.ToByte(text.Substring(i * 2, 2), 16);
        }

        return bytes;
    }

    private static string ToPrintableAscii(byte[] data)
    {
        var chars = new char[data.Length];
        for (var i = 0; i < data.Length; i++)
        {
            var b = data[i];
            chars[i] = b is >= 32 and <= 126 ? (char)b : '.';
        }

        return new string(chars).Trim().Trim('.');
    }

    private static void EnsureReadyForMemoryOp()
    {
        if (!_connected)
        {
            throw new InvalidOperationException("Not connected.");
        }

        if (!_inventoryRunning)
        {
            return;
        }

        StopInventory();
        Thread.Sleep(30);
    }

    private static void ReadTagMemory(string[] args)
    {
        if (args.Length < 6)
        {
            Console.WriteLine("Usage: read-mem <token> <epcHex> <bank> <wordPtr> <wordCount> [accessPwdHex]");
            return;
        }

        var token = args[1];
        try
        {
            EnsureReadyForMemoryOp();
            var epc = ParseHexBytes(args[2], "EPC");
            var bank = ResolveMemoryBank(args[3]);
            if (!int.TryParse(args[4], out var wordPtr) || wordPtr < 0)
            {
                throw new InvalidOperationException("Invalid word pointer.");
            }

            if (!byte.TryParse(args[5], out var wordCount) || wordCount == 0 || wordCount > 32)
            {
                throw new InvalidOperationException("Word count must be 1-32.");
            }

            var pwd = args.Length >= 7 ? ParseHexBytes(args[6], "Access password") : new byte[] { 0, 0, 0, 0 };
            if (pwd.Length != 4)
            {
                throw new InvalidOperationException("Access password must be 4 bytes (8 hex chars).");
            }

            var buffer = new byte[Math.Max(64, wordCount * 2)];
            int code;
            lock (Sync)
            {
                code = NativeMethods.UHFReadData(
                    pwd,
                    1,
                    32,
                    epc.Length * 8,
                    epc,
                    bank,
                    wordPtr,
                    wordCount,
                    buffer);
            }

            var payload = new byte[wordCount * 2];
            Buffer.BlockCopy(buffer, 0, payload, 0, payload.Length);
            var ok = code == 0;
            Console.WriteLine(
                $"MEM token={token} action=read ok={(ok ? 1 : 0)} code={code} bank={args[3].ToLowerInvariant()} epc={ToHex(epc)} data={(ok ? ToHex(payload) : "")} ascii={(ok ? ToPrintableAscii(payload) : "")}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"MEM token={token} action=read ok=0 code=-1 message={ex.Message.Replace(' ', '_')}");
        }
    }

    private static void WriteTagMemory(string[] args)
    {
        if (args.Length < 6)
        {
            Console.WriteLine("Usage: write-mem <token> <epcHex> <bank> <wordPtr> <dataHex> [accessPwdHex]");
            return;
        }

        var token = args[1];
        try
        {
            EnsureReadyForMemoryOp();
            var epc = ParseHexBytes(args[2], "EPC");
            var bank = ResolveMemoryBank(args[3]);
            if (!int.TryParse(args[4], out var wordPtr) || wordPtr < 0)
            {
                throw new InvalidOperationException("Invalid word pointer.");
            }

            var data = ParseWriteWords(args[5]);

            var pwd = args.Length >= 7 ? ParseHexBytes(args[6], "Access password") : new byte[] { 0, 0, 0, 0 };
            if (pwd.Length != 4)
            {
                throw new InvalidOperationException("Access password must be 4 bytes (8 hex chars).");
            }

            if (bank == 1 && wordPtr == 2)
            {
                data = WithEpcPc(data);
                wordPtr = 1;
            }

            var wordCount = (byte)(data.Length / 2);
            int code;
            lock (Sync)
            {
                code = NativeMethods.UHFWriteData(
                    pwd,
                    1,
                    32,
                    epc.Length * 8,
                    epc,
                    bank,
                    wordPtr,
                    wordCount,
                    data);
            }

            if (code != 0)
            {
                Thread.Sleep(40);
                lock (Sync)
                {
                    code = NativeMethods.UHFWriteData(
                        pwd,
                        1,
                        32,
                        epc.Length * 8,
                        epc,
                        bank,
                        wordPtr,
                        wordCount,
                        data);
                }
            }

            var ok = code == 0;
            Console.WriteLine(
                $"MEM token={token} action=write ok={(ok ? 1 : 0)} code={code} bank={args[3].ToLowerInvariant()} epc={ToHex(epc)} words={wordCount} ptr={wordPtr} data={ToHex(data)}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"MEM token={token} action=write ok=0 code=-1 message={ex.Message.Replace(' ', '_')}");
        }
    }

    private static void ReadLoop()
    {
        while (true)
        {
            lock (Sync)
            {
                if (!_inventoryRunning)
                {
                    return;
                }
            }

            var tag = TryPollTag(out var source, out var rawLen, out _);
            if (tag is null)
            {
                if (!_readLoopHintPrinted
                    && _readLoopStartedAt != DateTime.MinValue
                    && (DateTime.UtcNow - _readLoopStartedAt).TotalSeconds >= 8)
                {
                    _readLoopHintPrinted = true;
                    Console.WriteLine(
                        "INFO: scanning active but no tags yet — set power to 300 (maximum) on the slider, "
                        + "spread tags flat on the tray, and use COM/Serial mode if USB is slow.");
                }
                Thread.Sleep(1);
                continue;
            }

            _readLoopHintPrinted = true;

            if (_unparsedTagFrameLogs < 1 && !string.IsNullOrWhiteSpace(source))
            {
                _unparsedTagFrameLogs++;
                Console.WriteLine($"INFO: first tag via {source} ({rawLen} bytes)");
            }

            var tagKey = BuildTagKey(tag);
            lock (Sync)
            {
                if (!SeenTags.Add(tagKey))
                {
                    continue;
                }
            }

            if (SeenTags.Count % 10 == 0)
            {
                Console.WriteLine($"INFO: {SeenTags.Count} unique tags collected so far...");
            }

            Console.WriteLine($"TAG dev={tag.ConnectId} epc={tag.Epc} tid={tag.Tid} rssi={tag.Rssi} ant={tag.Antenna} phase={tag.Phase} user={tag.User}");
        }
    }

    private static bool IsValidTag(TagData tag)
    {
        var epc = (tag.Epc ?? "").Trim().ToUpperInvariant();
        var tid = (tag.Tid ?? "").Trim().ToUpperInvariant();
        if (tid.Length >= 16)
        {
            return true;
        }

        if (epc.Length >= 12 && epc != "0000" && !epc.StartsWith("0000", StringComparison.Ordinal))
        {
            return true;
        }

        return false;
    }

    private static TagData? TryPollTag(out string source, out int rawLen, out byte[] rawBytes)
    {
        source = string.Empty;
        rawLen = 0;
        rawBytes = Array.Empty<byte>();
        var buffer = new byte[512];
        TagData? best = null;

        var len = NativeMethods.UHFGetTagData(buffer, buffer.Length);
        if (len > 0)
        {
            rawLen = len;
            rawBytes = new byte[len];
            Array.Copy(buffer, rawBytes, len);
            var parsed = ParseTagFrame(buffer, len);
            if (parsed is not null && IsValidTag(parsed))
            {
                source = "UHFGetTagData";
                return parsed;
            }

            best = parsed;
        }

        var uLen = 0;
        if (NativeMethods.UHF_GetReceived_EX(ref uLen, buffer) == 0 && uLen > 0)
        {
            rawLen = uLen;
            rawBytes = new byte[uLen];
            Array.Copy(buffer, rawBytes, uLen);
            var parsed = ParseTagReceivedEx(buffer, uLen);
            if (parsed is not null && IsValidTag(parsed))
            {
                source = "UHF_GetReceived_EX";
                return parsed;
            }

            if (best is null)
            {
                best = parsed;
            }
        }

        if (best is not null && IsValidTag(best))
        {
            source = string.IsNullOrWhiteSpace(source) ? "UHFGetTagData" : source;
            return best;
        }

        return null;
    }

    /// <summary>Parse UHFGetTagData frame (CONTENT_TYPE: 1=EPC, 2=TID, 4=RSSI, 5=ANT, 6=ID) or legacy CELL layout.</summary>
    private static TagData? ParseTagFrame(byte[] data, int length)
    {
        if (length > 0 && data[0] <= 8)
        {
            var contentTypeTag = ParseTagContentType(data, length);
            if (contentTypeTag is not null)
            {
                return contentTypeTag;
            }
        }

        return ParseTagCell(data, length);
    }

    private static TagData? ParseTagContentType(byte[] data, int length)
    {
        var tag = new TagData();
        var index = 0;
        while (index < length)
        {
            if (index + 1 >= length)
            {
                break;
            }

            var type = data[index++];
            var len = data[index++];
            if (len < 0 || index + len > length)
            {
                break;
            }

            var field = new byte[len];
            Array.Copy(data, index, field, 0, len);
            index += len;

            switch (type)
            {
                case 1:
                    tag.Epc = EpcFromPcPrefixed(field);
                    break;
                case 2:
                    tag.Tid = ToHex(field);
                    break;
                case 3:
                    tag.User = ToHex(field);
                    break;
                case 4 when field.Length >= 2:
                {
                    var rssiTemp = (field[1] | (field[0] << 8)) - 65535;
                    tag.Rssi = ((float)rssiTemp / 10.0).ToString("0.0");
                    break;
                }
                case 5 when field.Length > 0:
                    tag.Antenna = field[0].ToString();
                    break;
                case 6 when field.Length > 0:
                    tag.ConnectId = field.Length > 1 ? field[1].ToString() : field[0].ToString();
                    break;
            }
        }

        if (string.IsNullOrWhiteSpace(tag.Epc) && string.IsNullOrWhiteSpace(tag.Tid))
        {
            return null;
        }

        return tag;
    }

    private static TagData? ParseTagReceivedEx(byte[] bufData, int uLen)
    {
        if (uLen <= 1 || bufData.Length < uLen)
        {
            return null;
        }

        var uiiLen = bufData[0];
        if (uiiLen <= 0 || uiiLen + 1 >= uLen)
        {
            return null;
        }

        var tidLen = bufData[uiiLen + 1];
        var tidIndex = uiiLen + 2;
        var rssiIndex = 1 + uiiLen + 1 + tidLen;
        var antIndex = rssiIndex + 2;
        if (antIndex >= uLen)
        {
            return null;
        }

        var hex = ToHex(bufData, 0, uLen);
        var tag = new TagData();

        if (uiiLen * 2 >= 4 && hex.Length >= 6 + uiiLen * 2 - 4)
        {
            var pcAndEpc = new byte[uiiLen];
            Buffer.BlockCopy(bufData, 1, pcAndEpc, 0, uiiLen);
            tag.Epc = EpcFromPcPrefixed(pcAndEpc);
        }

        if (tidLen > 0 && tidIndex * 2 + tidLen * 2 <= hex.Length)
        {
            tag.Tid = hex.Substring(tidIndex * 2, tidLen * 2);
        }

        if (rssiIndex * 2 + 4 <= hex.Length)
        {
            var temp = hex.Substring(rssiIndex * 2, 4);
            if (int.TryParse(temp, System.Globalization.NumberStyles.HexNumber, null, out var rssiRaw))
            {
                var rssiTemp = rssiRaw - 65535;
                tag.Rssi = ((float)rssiTemp / 10.0).ToString("0.0");
            }
        }

        if (antIndex * 2 + 2 <= hex.Length)
        {
            var antHex = hex.Substring(antIndex * 2, 2);
            if (int.TryParse(antHex, System.Globalization.NumberStyles.HexNumber, null, out var ant))
            {
                tag.Antenna = ant.ToString();
            }
        }

        if (string.IsNullOrWhiteSpace(tag.Epc) && string.IsNullOrWhiteSpace(tag.Tid))
        {
            return null;
        }

        return tag;
    }

    private static string BuildTagKey(TagData tag)
    {
        var devicePrefix = string.IsNullOrWhiteSpace(tag.ConnectId) ? "dev:unknown" : $"dev:{tag.ConnectId}";
        if (!string.IsNullOrWhiteSpace(tag.Tid))
        {
            return $"{devicePrefix}|tid:{tag.Tid}";
        }

        return $"{devicePrefix}|epc:{tag.Epc}";
    }

    private static TagData? ParseTagCell(byte[] data, int length)
    {
        var tag = new TagData();
        var index = 0;
        while (index + 1 < length)
        {
            var type = data[index++];
            var len = data[index++];
            if (index + len > length)
            {
                break;
            }

            var field = new byte[len];
            Array.Copy(data, index, field, 0, len);
            index += len;

            switch (type)
            {
                case CellConnectId:
                    tag.ConnectId = field.Length > 0 ? field[0].ToString() : "";
                    break;
                case CellUhfEpc:
                    tag.Epc = EpcFromPcPrefixed(field);
                    break;
                case CellUhfTid:
                    tag.Tid = ToHex(field);
                    break;
                case CellUhfRssi:
                    tag.Rssi = field.Length > 0 ? unchecked((sbyte)field[0]).ToString() : "";
                    break;
                case CellUhfAntenna:
                    tag.Antenna = field.Length > 0 ? field[0].ToString() : "";
                    break;
                case CellUhfPhase:
                    tag.Phase = field.Length > 0 ? field[0].ToString() : "";
                    break;
                case CellUhfUser:
                    tag.User = ToHex(field);
                    break;
            }
        }

        if (string.IsNullOrWhiteSpace(tag.Epc) && string.IsNullOrWhiteSpace(tag.Tid))
        {
            return null;
        }

        return tag;
    }

    /// <summary>
    /// Inventory frames from UHFAPI are often a fixed 12-byte EPC buffer.
    /// The PC word (first 2 bytes, bits 15–11) is the real length in words.
    /// Bytes past that length are SDK padding and are not part of the EPC.
    /// </summary>
    private static string EpcFromPcPrefixed(byte[] field)
    {
        if (field.Length == 0)
        {
            return "";
        }

        if (field.Length <= 2)
        {
            return ToHex(field);
        }

        var words = (field[0] >> 3) & 0x1F;
        var epcLen = words * 2;
        var available = field.Length - 2;
        if (words is >= 1 and <= 31 && epcLen <= available)
        {
            return ToHex(field, 2, epcLen);
        }

        var end = field.Length;
        while (end > 2 && field[end - 1] == 0)
        {
            end--;
        }

        if (end <= 2)
        {
            end = Math.Min(field.Length, 4);
        }

        return ToHex(field, 2, end - 2);
    }

    private static string ToHex(byte[] bytes)
    {
        return BitConverter.ToString(bytes).Replace("-", string.Empty);
    }

    private static string ToHex(byte[] bytes, int offset, int count)
    {
        return BitConverter.ToString(bytes, offset, count).Replace("-", string.Empty);
    }

    private static void RememberDeviceIds(List<DeviceRow> devices)
    {
        _deviceIds.Clear();
        _deviceIds.AddRange(devices.Select(d => d.Id).Where(id => id >= 0).Distinct());
    }

    private static List<int> GetConnectedDeviceIds()
    {
        if (_deviceIds.Count > 0)
        {
            return _deviceIds;
        }

        var devices = GetConnectedDevices();
        RememberDeviceIds(devices);
        return _deviceIds;
    }

    private static List<DeviceRow> GetConnectedDevices()
    {
        var buffer = new byte[1024 * 100];
        var resultLen = NativeMethods.LinkGetInfo(buffer, buffer.Length);
        if (resultLen <= 0)
        {
            return new List<DeviceRow>();
        }

        try
        {
            var json = Encoding.ASCII.GetString(buffer, 0, resultLen).Replace("\0", "");
            using var doc = JsonDocument.Parse(json);
            var list = new List<DeviceRow>();
            foreach (var element in doc.RootElement.EnumerateArray())
            {
                if (!element.TryGetProperty("connected", out var connectedProp) || !connectedProp.GetBoolean())
                {
                    continue;
                }

                list.Add(new DeviceRow
                {
                    Id = element.TryGetProperty("id", out var idProp) ? idProp.GetInt32() : 0,
                    Type = element.TryGetProperty("type", out var typeProp) ? typeProp.GetString() ?? "" : "",
                    Ip = element.TryGetProperty("ip", out var ipProp) ? ipProp.GetString() ?? "" : "",
                    Port = element.TryGetProperty("port", out var portProp) ? portProp.GetInt32() : 0
                });
            }

            return list;
        }
        catch
        {
            return new List<DeviceRow>();
        }
    }

    private sealed class TagData
    {
        public string ConnectId { get; set; } = "";
        public string Epc { get; set; } = "";
        public string Tid { get; set; } = "";
        public string Rssi { get; set; } = "";
        public string Antenna { get; set; } = "";
        public string Phase { get; set; } = "";
        public string User { get; set; } = "";
    }

    private sealed class DeviceRow
    {
        public int Id { get; set; }
        public string Type { get; set; } = "";
        public string Ip { get; set; } = "";
        public int Port { get; set;         }
    }
}

/// <summary>
/// Resolves TX power APIs at runtime — vendor DLLs expose different export names, return types (BOOL vs int),
/// and calling conventions (cdecl vs stdcall).
/// </summary>
internal static class UhfPowerInterop
{
    private static nint _handle;
    private static bool _loadAttempted;

    private enum SetBinding { None, SaveDbmCdecl, SaveDbmStd, BoolCdecl, BoolStd, IntCdecl, IntStd }
    private enum GetBinding { None, SaveDbmCdecl, SaveDbmStd, BoolCdecl, BoolStd, IntCdecl, IntStd }

    private static SetBinding _setBinding;
    private static GetBinding _getBinding;
    private static Delegate? _setDel;
    private static Delegate? _getDel;

    private static readonly string[] SetExportCandidates =
    {
        "UHFSetPower",
        "SetPower",
        "UHFAPI_SET_PowerControl",
        "UHFAPI_SetPowerControl",
        "UHF_SetPowerControl",
        "SetPowerControl",
        "UHFPowerSet",
        "RFID_SetPower",
    };

    private static readonly string[] GetExportCandidates =
    {
        "UHFGetPower",
        "GetPower",
        "UHFAPI_GET_PowerControl",
        "UHFAPI_GetPowerControl",
        "UHF_GetPowerControl",
        "GetPowerControl",
        "UHFPowerGet",
        "RFID_GetPower",
    };

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int SetPowerSaveDbmCdecl(byte save, byte uPower);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int SetPowerSaveDbmStd(byte save, byte uPower);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int GetPowerSaveDbmCdecl(ref byte uPower);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int GetPowerSaveDbmStd(ref byte uPower);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate bool SetPowerBoolCdecl(uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate bool SetPowerBoolStd(uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int SetPowerIntCdecl(uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int SetPowerIntStd(uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate bool GetPowerBoolCdecl(out uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate bool GetPowerBoolStd(out uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int GetPowerIntCdecl(out uint attDb10);

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate int GetPowerIntStd(out uint attDb10);

    private static void EnsureDllLoaded()
    {
        if (_loadAttempted) return;
        _loadAttempted = true;
        var path = Path.Combine(AppContext.BaseDirectory, "UHFAPI.dll");
        try
        {
            _handle = NativeLibrary.Load(path);
            return;
        }
        catch (DllNotFoundException) { /* fall through */ }
        catch (Exception) { /* fall through */ }

        try
        {
            _handle = NativeLibrary.Load("UHFAPI.dll");
        }
        catch
        {
            _handle = 0;
        }
    }

    private static bool TryBindDelegate<T>(nint addr, out Delegate del) where T : Delegate
    {
        try
        {
            del = Marshal.GetDelegateForFunctionPointer<T>(addr);
            return true;
        }
        catch
        {
            del = null!;
            return false;
        }
    }

    public static byte AttDb10ToDbm(uint attDb10)
    {
        var clamped = Math.Clamp(attDb10, 0u, 300u);
        return (byte)Math.Clamp(30 - (clamped * 25.0 / 300.0), 5, 30);
    }

    public static uint DbmToAttDb10(byte dbm)
    {
        var clamped = Math.Clamp(dbm, (byte)5, (byte)30);
        return (uint)Math.Clamp((int)Math.Round((30 - clamped) * 300.0 / 25.0), 0, 300);
    }

    private static bool TryBindSetExport(string name, nint addr)
    {
        if (name is "UHFSetPower" or "SetPower")
        {
            if (TryBindDelegate<SetPowerSaveDbmCdecl>(addr, out var saveDbm))
            {
                _setDel = saveDbm;
                _setBinding = SetBinding.SaveDbmCdecl;
                Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (save+dBm, cdecl).");
                return true;
            }

            if (TryBindDelegate<SetPowerSaveDbmStd>(addr, out saveDbm))
            {
                _setDel = saveDbm;
                _setBinding = SetBinding.SaveDbmStd;
                Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (save+dBm, stdcall).");
                return true;
            }
        }

        if (TryBindDelegate<SetPowerBoolCdecl>(addr, out var d))
        {
            _setDel = d;
            _setBinding = SetBinding.BoolCdecl;
            Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (BOOL, cdecl).");
            return true;
        }

        if (TryBindDelegate<SetPowerBoolStd>(addr, out d))
        {
            _setDel = d;
            _setBinding = SetBinding.BoolStd;
            Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (BOOL, stdcall).");
            return true;
        }

        if (TryBindDelegate<SetPowerIntCdecl>(addr, out d))
        {
            _setDel = d;
            _setBinding = SetBinding.IntCdecl;
            Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (int, cdecl).");
            return true;
        }

        if (TryBindDelegate<SetPowerIntStd>(addr, out d))
        {
            _setDel = d;
            _setBinding = SetBinding.IntStd;
            Console.WriteLine($"INFO: TX power SET uses export \"{name}\" (int, stdcall).");
            return true;
        }

        return false;
    }

    private static bool TryBindGetExport(string name, nint addr)
    {
        if (name is "UHFGetPower" or "GetPower")
        {
            if (TryBindDelegate<GetPowerSaveDbmCdecl>(addr, out var saveDbm))
            {
                _getDel = saveDbm;
                _getBinding = GetBinding.SaveDbmCdecl;
                Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (dBm ref, cdecl).");
                return true;
            }

            if (TryBindDelegate<GetPowerSaveDbmStd>(addr, out saveDbm))
            {
                _getDel = saveDbm;
                _getBinding = GetBinding.SaveDbmStd;
                Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (dBm ref, stdcall).");
                return true;
            }
        }

        if (TryBindDelegate<GetPowerBoolCdecl>(addr, out var d))
        {
            _getDel = d;
            _getBinding = GetBinding.BoolCdecl;
            Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (BOOL, cdecl).");
            return true;
        }

        if (TryBindDelegate<GetPowerBoolStd>(addr, out d))
        {
            _getDel = d;
            _getBinding = GetBinding.BoolStd;
            Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (BOOL, stdcall).");
            return true;
        }

        if (TryBindDelegate<GetPowerIntCdecl>(addr, out d))
        {
            _getDel = d;
            _getBinding = GetBinding.IntCdecl;
            Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (int, cdecl).");
            return true;
        }

        if (TryBindDelegate<GetPowerIntStd>(addr, out d))
        {
            _getDel = d;
            _getBinding = GetBinding.IntStd;
            Console.WriteLine($"INFO: TX power GET uses export \"{name}\" (int, stdcall).");
            return true;
        }

        return false;
    }

    private static bool BindSet()
    {
        if (_setBinding != SetBinding.None) return true;
        EnsureDllLoaded();
        if (_handle == 0) return false;

        foreach (var name in SetExportCandidates)
        {
            if (!NativeLibrary.TryGetExport(_handle, name, out var addr)) continue;
            if (TryBindSetExport(name, addr)) return true;
        }

        return false;
    }

    private static bool BindGet()
    {
        if (_getBinding != GetBinding.None) return true;
        EnsureDllLoaded();
        if (_handle == 0) return false;

        foreach (var name in GetExportCandidates)
        {
            if (!NativeLibrary.TryGetExport(_handle, name, out var addr)) continue;
            if (TryBindGetExport(name, addr)) return true;
        }

        return false;
    }

    public static bool TrySetPower(uint attDb10, out int returnCode, out string? errorDetail)
    {
        returnCode = -1;
        errorDetail = null;
        if (!BindSet())
        {
            errorDetail =
                "No TX power SET API found in UHFAPI.dll (inventory still works). Install the UHFAPI.dll from your reader manufacturer's SDK—your current DLL does not publish power-control exports under known names.";
            return false;
        }

        try
        {
            switch (_setBinding)
            {
                case SetBinding.SaveDbmCdecl:
                {
                    var dbm = AttDb10ToDbm(attDb10);
                    returnCode = ((SetPowerSaveDbmCdecl)_setDel!)(0, dbm);
                    break;
                }
                case SetBinding.SaveDbmStd:
                {
                    var dbm = AttDb10ToDbm(attDb10);
                    returnCode = ((SetPowerSaveDbmStd)_setDel!)(0, dbm);
                    break;
                }
                case SetBinding.BoolCdecl:
                {
                    var ok = ((SetPowerBoolCdecl)_setDel!)(attDb10);
                    returnCode = ok ? 0 : -1;
                    break;
                }
                case SetBinding.BoolStd:
                {
                    var ok = ((SetPowerBoolStd)_setDel!)(attDb10);
                    returnCode = ok ? 0 : -1;
                    break;
                }
                case SetBinding.IntCdecl:
                    returnCode = ((SetPowerIntCdecl)_setDel!)(attDb10);
                    break;
                case SetBinding.IntStd:
                    returnCode = ((SetPowerIntStd)_setDel!)(attDb10);
                    break;
                default:
                    errorDetail = "TX power SET binding is invalid.";
                    return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            errorDetail = ex.Message;
            return false;
        }
    }

    public static bool TryGetPower(out uint attDb10, out int returnCode, out string? errorDetail)
    {
        attDb10 = 0;
        returnCode = -1;
        errorDetail = null;
        if (!BindGet())
        {
            errorDetail =
                "No TX power GET API found in UHFAPI.dll. Use an SDK-matching UHFAPI.dll if you need read-back.";
            return false;
        }

        try
        {
            switch (_getBinding)
            {
                case GetBinding.SaveDbmCdecl:
                {
                    byte dbm = 0;
                    returnCode = ((GetPowerSaveDbmCdecl)_getDel!)(ref dbm);
                    attDb10 = DbmToAttDb10(dbm);
                    break;
                }
                case GetBinding.SaveDbmStd:
                {
                    byte dbm = 0;
                    returnCode = ((GetPowerSaveDbmStd)_getDel!)(ref dbm);
                    attDb10 = DbmToAttDb10(dbm);
                    break;
                }
                case GetBinding.BoolCdecl:
                {
                    var ok = ((GetPowerBoolCdecl)_getDel!)(out attDb10);
                    returnCode = ok ? 0 : -1;
                    break;
                }
                case GetBinding.BoolStd:
                {
                    var ok = ((GetPowerBoolStd)_getDel!)(out attDb10);
                    returnCode = ok ? 0 : -1;
                    break;
                }
                case GetBinding.IntCdecl:
                    returnCode = ((GetPowerIntCdecl)_getDel!)(out attDb10);
                    break;
                case GetBinding.IntStd:
                    returnCode = ((GetPowerIntStd)_getDel!)(out attDb10);
                    break;
                default:
                    errorDetail = "TX power GET binding is invalid.";
                    return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            errorDetail = ex.Message;
            return false;
        }
    }

    /// <summary>BOOL APIs: success/fail via TrySetPower/TryGetPower returnCode 0 vs -1; int APIs: vendor-specific.</summary>
    public static bool IsPowerReturnOk(int rc) => rc == 0 || rc == 1;
}

internal static class NativeMethods
{
    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int TCPConnect(StringBuilder ip, uint hostport);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void TCPDisconnect();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int ComOpenWithBaud(int port, int baudrate);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int ComOpen(int comName);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void ClosePort();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UsbOpen();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void UsbClose();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFSetEPCTIDMode(byte saveflag, byte mode);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHF_GetReceived_EX(ref int uLenUii, byte[] uUii);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFInventory();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFInventoryById(int id);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFStopById(int id);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFStopGet();

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFGetTagData(byte[] tdata, int recvlen);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFReadData(
        byte[] accessPwd,
        byte filterBank,
        int filterStartAddrBits,
        int filterLenBits,
        byte[] filterData,
        byte bank,
        int wordPtr,
        byte wordCount,
        byte[] readBuffer);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int UHFWriteData(
        byte[] accessPwd,
        byte filterBank,
        int filterStartAddrBits,
        int filterLenBits,
        byte[] filterData,
        byte bank,
        int wordPtr,
        byte wordCount,
        byte[] writeData);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern int LinkGetInfo(byte[] info, int len);

    [DllImport("UHFAPI.dll", CallingConvention = CallingConvention.Cdecl)]
    public static extern void LinkCloseAll();
}
