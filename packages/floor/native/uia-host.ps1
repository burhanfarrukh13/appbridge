# Appbridge Windows Floor host.
# A long-lived JSON-lines worker over stdio: it is the only place that touches
# UI Automation, Win32 window handles, input synthesis and screen capture.
# It contains no per-app knowledge.

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

Add-Type -AssemblyName UIAutomationClient | Out-Null
Add-Type -AssemblyName UIAutomationTypes | Out-Null
Add-Type -AssemblyName WindowsBase | Out-Null
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

$nativeSource = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class AbNative {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }

  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern IntPtr OpenWindowStation(string a, bool b, uint access);
  [DllImport("user32.dll")] public static extern bool SetProcessWindowStation(IntPtr hWinSta);
  [DllImport("user32.dll")] public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);
  [DllImport("user32.dll")] public static extern bool SetThreadDesktop(IntPtr hDesktop);

  public static void AttachInteractiveDesktop() {
    try {
      IntPtr hwinsta = OpenWindowStation("winsta0", false, 0x037F);
      if (hwinsta != IntPtr.Zero) SetProcessWindowStation(hwinsta);
      IntPtr hdesk = OpenDesktop("default", 0, false, 0x01FF);
      if (hdesk != IntPtr.Zero) SetThreadDesktop(hdesk);
    } catch {}
  }

  public static System.Collections.Generic.List<IntPtr> GetDesktopHwnds() {
    AttachInteractiveDesktop();
    IntPtr hdesk = OpenDesktop("default", 0, false, 0x01FF);
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumDesktopWindows(hdesk != IntPtr.Zero ? hdesk : IntPtr.Zero, (hWnd, lParam) => {
      if (IsWindowVisible(hWnd)) {
        var sb = new System.Text.StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        if (!string.IsNullOrWhiteSpace(sb.ToString())) {
          list.Add(hWnd);
        }
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static void MoveTo(int x, int y) { SetCursorPos(x, y); }

  public static void ClickButton(int x, int y, int button, int count) {
    SetCursorPos(x, y);
    Thread.Sleep(25);
    uint down = 0x0002; uint up = 0x0004;
    if (button == 1) { down = 0x0008; up = 0x0010; }
    else if (button == 2) { down = 0x0020; up = 0x0040; }
    for (int i = 0; i < count; i++) {
      mouse_event(down, 0, 0, 0, UIntPtr.Zero);
      mouse_event(up, 0, 0, 0, UIntPtr.Zero);
      if (i + 1 < count) Thread.Sleep(70);
    }
  }

  public static void MouseDown(int button) {
    uint down = button == 1 ? 0x0008u : (button == 2 ? 0x0020u : 0x0002u);
    mouse_event(down, 0, 0, 0, UIntPtr.Zero);
  }
  public static void MouseUp(int button) {
    uint up = button == 1 ? 0x0010u : (button == 2 ? 0x0040u : 0x0004u);
    mouse_event(up, 0, 0, 0, UIntPtr.Zero);
  }
  public static void Wheel(int delta) { mouse_event(0x0800, 0, 0, unchecked((uint)delta), UIntPtr.Zero); }

  private static INPUT KeyInput(ushort vk, ushort scan, uint flags) {
    INPUT i = new INPUT();
    i.type = 1;
    i.U.ki = new KEYBDINPUT();
    i.U.ki.wVk = vk;
    i.U.ki.wScan = scan;
    i.U.ki.dwFlags = flags;
    return i;
  }

  public static void KeyPress(int vk) {
    keybd_event((byte)vk, 0, 0, UIntPtr.Zero);
    Thread.Sleep(12);
    keybd_event((byte)vk, 0, 2, UIntPtr.Zero);
  }

  public static void KeyCombo(int[] codes) {
    for (int i = 0; i < codes.Length; i++) { keybd_event((byte)codes[i], 0, 0, UIntPtr.Zero); Thread.Sleep(15); }
    for (int i = codes.Length - 1; i >= 0; i--) { keybd_event((byte)codes[i], 0, 2, UIntPtr.Zero); Thread.Sleep(15); }
  }

  public static void TypeText(string text) {
    foreach (char c in text) {
      if (c == '\r') continue;
      if (c == '\n') { KeyPress(0x0D); Thread.Sleep(20); continue; }
      if (c == '\t') { KeyPress(0x09); Thread.Sleep(20); continue; }
      INPUT[] down = new INPUT[1] { KeyInput(0, (ushort)c, 4) };
      INPUT[] up = new INPUT[1] { KeyInput(0, (ushort)c, 6) };
      SendInput(1, down, Marshal.SizeOf(typeof(INPUT)));
      SendInput(1, up, Marshal.SizeOf(typeof(INPUT)));
      Thread.Sleep(1);
    }
  }

  public static void FocusWindow(IntPtr h) {
    uint fgPid;
    uint targetPid;
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), out fgPid);
    uint target = GetWindowThreadProcessId(h, out targetPid);
    if (IsIconic(h)) ShowWindow(h, 9);
    if (fg != target) {
      AttachThreadInput(fg, target, true);
      BringWindowToTop(h);
      SetForegroundWindow(h);
      AttachThreadInput(fg, target, false);
    } else {
      SetForegroundWindow(h);
    }
    Thread.Sleep(60);
  }

  public static void MoveResize(IntPtr h, int x, int y, int w, int hgt) {
    SetWindowPos(h, IntPtr.Zero, x, y, w, hgt, 0x0004);
  }

  public static void CloseWindow(IntPtr h) {
    SendMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
  }

  public static POINT CursorPosition() { POINT p; GetCursorPos(out p); return p; }
}
"@

Add-Type -TypeDefinition $nativeSource -Language CSharp | Out-Null
[void][AbNative]::SetProcessDPIAware()
[AbNative]::AttachInteractiveDesktop()

$script:WINDOWS = @{}
$script:ELS = @{}

function Write-Protocol($obj) {
  $json = $obj | ConvertTo-Json -Depth 12 -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

function Throw-Coded($code, $message) {
  throw ('[' + $code + '] ' + $message)
}

function Get-ProcessNameSafe($procId) {
  try { return (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { return '' }
}

function Get-RectValues($el) {
  $x = 0; $y = 0; $w = 0; $h = 0; $offscreen = $false
  try {
    $r = $el.Current.BoundingRectangle
    if ($r -ne $null -and -not [double]::IsInfinity($r.Width) -and -not [double]::IsInfinity($r.Height)) {
      $x = [int][Math]::Round($r.X); $y = [int][Math]::Round($r.Y)
      $w = [int][Math]::Round($r.Width); $h = [int][Math]::Round($r.Height)
    }
  } catch { }
  try { $offscreen = [bool]$el.Current.IsOffscreen } catch { }
  return @{ x = $x; y = $y; width = $w; height = $h; offscreen = $offscreen }
}

function Update-Windows {
  [AbNative]::AttachInteractiveDesktop()
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $condition = [System.Windows.Automation.Condition]::TrueCondition
  $children = $null
  try { $children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition) } catch { }
  if ($null -eq $children -or $children.Count -eq 0) {
    # Fallback to EnumDesktopWindows when RootElement.FindAll is empty in background subshells
    $hwnds = [AbNative]::GetDesktopHwnds()
    $childList = New-Object System.Collections.ArrayList
    foreach ($h in $hwnds) {
      try {
        $wrapped = [System.Windows.Automation.AutomationElement]::FromHandle($h)
        if ($null -ne $wrapped) { [void]$childList.Add($wrapped) }
      } catch { }
    }
    $children = $childList
  }
  $fg = [AbNative]::GetForegroundWindow()
  $result = New-Object System.Collections.ArrayList
  $map = @{}
  foreach ($el in $children) {
    try {
      $hwnd = [IntPtr][int64]$el.Current.NativeWindowHandle
      if ($hwnd -eq [IntPtr]::Zero) { continue }
      $id = [string]$hwnd.ToInt64()
      if ($map.ContainsKey($id)) { continue }
      $title = ''
      try { $title = [string]$el.Current.Name } catch { }
      $class = ''
      try { $class = [string]$el.Current.ClassName } catch { }
      $procId = 0
      try { $procId = [int]$el.Current.ProcessId } catch { }
      $rect = Get-RectValues $el
      $map[$id] = @{ Element = $el; Hwnd = $hwnd }
      [void]$result.Add(@{
        id = $id
        title = $title
        className = $class
        pid = $procId
        processName = (Get-ProcessNameSafe $procId)
        bounds = @{ x = $rect.x; y = $rect.y; width = $rect.width; height = $rect.height }
        focused = ($hwnd -eq $fg)
        minimized = [bool][AbNative]::IsIconic($hwnd)
        visible = [bool][AbNative]::IsWindowVisible($hwnd)
      })
    } catch { }
  }
  $script:WINDOWS = $map
  return $result
}

function Resolve-Window($id) {
  if ($null -ne $id -and ([string]$id).Length -gt 0) {
    $key = [string]$id
    if ($script:WINDOWS.ContainsKey($key)) { return $script:WINDOWS[$key] }
    Update-Windows | Out-Null
    if ($script:WINDOWS.ContainsKey($key)) { return $script:WINDOWS[$key] }
    Throw-Coded 'window_not_found' ('no window with id ' + $key)
  }
  Update-Windows | Out-Null
  $fg = [string][AbNative]::GetForegroundWindow().ToInt64()
  if ($script:WINDOWS.ContainsKey($fg)) { return $script:WINDOWS[$fg] }
  foreach ($key in $script:WINDOWS.Keys) { return $script:WINDOWS[$key] }
  Throw-Coded 'window_not_found' 'no top-level windows are available'
}

function Get-PublicWindow($entry) {
  $el = $entry.Element
  $hwnd = $entry.Hwnd
  $title = ''
  try { $title = [string]$el.Current.Name } catch { }
  $class = ''
  try { $class = [string]$el.Current.ClassName } catch { }
  $procId = 0
  try { $procId = [int]$el.Current.ProcessId } catch { }
  $rect = Get-RectValues $el
  return @{
    id = [string]$hwnd.ToInt64()
    title = $title
    className = $class
    pid = $procId
    processName = (Get-ProcessNameSafe $procId)
    bounds = @{ x = $rect.x; y = $rect.y; width = $rect.width; height = $rect.height }
    focused = ($hwnd -eq [AbNative]::GetForegroundWindow())
    minimized = [bool][AbNative]::IsIconic($hwnd)
    visible = [bool][AbNative]::IsWindowVisible($hwnd)
  }
}

$script:INTERACTIVE_ROLES = @(
  'Button', 'Edit', 'MenuItem', 'CheckBox', 'RadioButton', 'ComboBox', 'ListItem',
  'TabItem', 'Hyperlink', 'TreeItem', 'Slider', 'Spinner', 'SplitButton', 'DataItem',
  'HeaderItem', 'ToolBar', 'ScrollBar', 'Menu'
)

function Get-PatternNames($el) {
  $names = New-Object System.Collections.ArrayList
  $pairs = @(
    @('invoke', [System.Windows.Automation.InvokePattern]::Pattern),
    @('value', [System.Windows.Automation.ValuePattern]::Pattern),
    @('toggle', [System.Windows.Automation.TogglePattern]::Pattern),
    @('selection', [System.Windows.Automation.SelectionItemPattern]::Pattern),
    @('expand', [System.Windows.Automation.ExpandCollapsePattern]::Pattern),
    @('scroll', [System.Windows.Automation.ScrollPattern]::Pattern),
    @('text', [System.Windows.Automation.TextPattern]::Pattern),
    @('range', [System.Windows.Automation.RangeValuePattern]::Pattern)
  )
  foreach ($pair in $pairs) {
    $obj = $null
    try { if ($el.TryGetCurrentPattern($pair[1], [ref]$obj)) { [void]$names.Add($pair[0]) } } catch { }
  }
  return $names
}

function Get-ElementInfo($el, $depth, $parentUid, $winId, $index, $includeOffscreen) {
  $role = ''
  try { $role = ([string]$el.Current.ControlType.ProgrammaticName) -replace '^ControlType\.', '' } catch { return $null }
  $name = ''
  try { $name = [string]$el.Current.Name } catch { }
  if ($name.Length -gt 200) { $name = $name.Substring(0, 200) }
  $rect = Get-RectValues $el
  if ($rect.offscreen -and -not $includeOffscreen) { return $null }

  $automationId = ''
  try { $automationId = [string]$el.Current.AutomationId } catch { }
  $className = ''
  try { $className = [string]$el.Current.ClassName } catch { }
  $enabled = $true
  try { $enabled = [bool]$el.Current.IsEnabled } catch { }
  $focused = $false
  try { $focused = [bool]$el.Current.HasKeyboardFocus } catch { }

  $uid = ''
  try {
    $rid = $el.GetRuntimeId()
    if ($null -ne $rid -and $rid.Length -gt 0) {
      $uid = ($rid | ForEach-Object { [string]$_ }) -join '.'
    }
  } catch { }
  if ($uid -eq '') { $uid = [string]$winId + '/' + [string]$depth + '/' + [string]$index }
  $uid = [string]$winId + ':' + $uid

  $patterns = New-Object System.Collections.ArrayList
  if ($script:INTERACTIVE_ROLES -contains $role) { $patterns = Get-PatternNames $el }

  $value = $null
  $masked = $false
  $isPassword = $false
  try { $isPassword = [bool]$el.Current.IsPassword } catch { }
  if ($patterns -contains 'value') {
    try {
      $vp = [System.Windows.Automation.ValuePattern]$el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($isPassword) { $masked = $true } else { $value = [string]$vp.Current.Value }
    } catch { }
  }

  return @{
    uid = $uid
    parent = $parentUid
    depth = $depth
    role = $role
    name = $name
    automationId = $automationId
    className = $className
    bounds = @{ x = $rect.x; y = $rect.y; width = $rect.width; height = $rect.height }
    enabled = $enabled
    focused = $focused
    offscreen = $rect.offscreen
    patterns = @($patterns)
    value = $value
    masked = $masked
    password = $isPassword
  }
}

function Get-TreeData($p) {
  $entry = Resolve-Window $p.windowId
  $winId = [string]$entry.Hwnd.ToInt64()
  $maxDepth = 20
  if ($null -ne $p.maxDepth) { $maxDepth = [int]$p.maxDepth }
  $maxElements = 1000
  if ($null -ne $p.maxElements) { $maxElements = [int]$p.maxElements }
  $includeOffscreen = $false
  if ($null -ne $p.includeOffscreen) { $includeOffscreen = [bool]$p.includeOffscreen }

  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Queue
  $startElement = $entry.Element
  if (-not [string]::IsNullOrEmpty([string]$p.rootUid)) {
    $startElement = Get-ElementByUid ([string]$p.rootUid)
  }
  $queue.Enqueue([pscustomobject]@{ El = $startElement; Depth = 0; Parent = $null; Index = 0 })
  $elements = New-Object System.Collections.ArrayList
  $truncated = $false

  while ($queue.Count -gt 0) {
    if ($elements.Count -ge $maxElements) { $truncated = $true; break }
    $node = $queue.Dequeue()
    $info = Get-ElementInfo $node.El $node.Depth $node.Parent $winId $node.Index $includeOffscreen
    if ($null -ne $info) {
      [void]$elements.Add($info)
      $script:ELS[$info.uid] = $node.El
      $parentUid = $info.uid
    } else {
      $parentUid = $node.Parent
    }
    $hasChildren = $false
    if ($node.Depth -ge $maxDepth) {
      try { if ($null -ne $walker.GetFirstChild($node.El)) { $hasChildren = $true } } catch { }
    } else {
      try {
        $child = $walker.GetFirstChild($node.El)
        $index = 0
        while ($null -ne $child) {
          if ($index -ge 500) { $truncated = $true; break }
          $queue.Enqueue([pscustomobject]@{ El = $child; Depth = $node.Depth + 1; Parent = $parentUid; Index = $index })
          $child = $walker.GetNextSibling($child)
          $index++
        }
        if ($index -gt 0) { $hasChildren = $true }
      } catch { }
    }
    if ($null -ne $info) { $info.hasChildren = $hasChildren }
  }

  $childrenByParent = @{}
  foreach ($element in $elements) {
    if ($null -ne $element.parent -and $element.parent -ne '') {
      if (-not $childrenByParent.ContainsKey($element.parent)) {
        $childrenByParent[$element.parent] = New-Object System.Collections.ArrayList
      }
      [void]$childrenByParent[$element.parent].Add($element.uid)
    }
  }
  foreach ($element in $elements) {
    if ($childrenByParent.ContainsKey($element.uid)) {
      $element.children = @($childrenByParent[$element.uid])
      $element.childCount = @($childrenByParent[$element.uid]).Count
      $element.hasChildren = $true
    } else {
      $element.children = @()
      $element.childCount = 0
      if ($null -eq $element.hasChildren) { $element.hasChildren = $false }
    }
  }

  if ($script:ELS.Count -gt 8000) { $script:ELS = @{} }

  return @{
    window = (Get-PublicWindow $entry)
    elements = @($elements)
    truncated = $truncated
    total = $elements.Count
  }
}

function Get-ElementByUid($uid) {
  if ([string]::IsNullOrEmpty([string]$uid)) { Throw-Coded 'bad_request' 'element id is required' }
  $key = [string]$uid
  if (-not $script:ELS.ContainsKey($key)) {
    Throw-Coded 'stale_element' ('unknown element id ' + $key + '; call screen.describe again')
  }
  return $script:ELS[$key]
}

function Invoke-Element($uid) {
  $el = Get-ElementByUid $uid
  $obj = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$obj)) {
    ([System.Windows.Automation.InvokePattern]$obj).Invoke()
    return @{ pattern = 'invoke'; route = 'uia' }
  }
  $obj = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$obj)) {
    ([System.Windows.Automation.TogglePattern]$obj).Toggle()
    return @{ pattern = 'toggle'; route = 'uia' }
  }
  $obj = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$obj)) {
    ([System.Windows.Automation.SelectionItemPattern]$obj).Select()
    return @{ pattern = 'selection'; route = 'uia' }
  }
  $obj = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$obj)) {
    ([System.Windows.Automation.ExpandCollapsePattern]$obj).Expand()
    return @{ pattern = 'expand'; route = 'uia' }
  }
  $rect = Get-RectValues $el
  if ($rect.width -le 0 -or $rect.height -le 0) { Throw-Coded 'no_effect' 'element has no clickable area' }
  $cx = [int]($rect.x + $rect.width / 2)
  $cy = [int]($rect.y + $rect.height / 2)
  [AbNative]::ClickButton($cx, $cy, 0, 1)
  return @{ pattern = 'mouse'; route = 'mouse' }
}

function Set-ElementValue($uid, $value) {
  $el = Get-ElementByUid $uid
  $text = [string]$value
  $obj = $null
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$obj)) {
    ([System.Windows.Automation.ValuePattern]$obj).SetValue($text)
    return @{ pattern = 'value'; route = 'uia' }
  }
  try { $el.SetFocus() } catch { }
  Start-Sleep -Milliseconds 60
  [AbNative]::KeyCombo(@(0x11, 0x41))
  Start-Sleep -Milliseconds 60
  [AbNative]::TypeText($text)
  return @{ pattern = 'keyboard'; route = 'keyboard' }
}

function Get-CaptureRect($p) {
  $x = 0; $y = 0; $w = 0; $h = 0
  if ($null -ne $p.windowId -and ([string]$p.windowId).Length -gt 0) {
    $entry = Resolve-Window $p.windowId
    $rect = Get-RectValues $entry.Element
    $x = $rect.x; $y = $rect.y; $w = $rect.width; $h = $rect.height
  } elseif ($null -ne $p.region) {
    $x = [int]$p.region.x; $y = [int]$p.region.y
    $w = [int]$p.region.width; $h = [int]$p.region.height
  } else {
    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $x = $screen.X; $y = $screen.Y; $w = $screen.Width; $h = $screen.Height
  }
  if ($w -le 0 -or $h -le 0) { Throw-Coded 'capture_failed' 'the capture region is empty' }
  return @{ x = $x; y = $y; width = $w; height = $h }
}

function Get-CaptureData($p) {
  $rect = Get-CaptureRect $p
  $x = $rect.x; $y = $rect.y; $w = $rect.width; $h = $rect.height

  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
  $graphics.Dispose()

  $scale = 1.0
  if ($null -ne $p.scale) { $scale = [double]$p.scale }
  if ($scale -lt 1.0 -and $scale -gt 0.05) {
    $tw = [int][Math]::Max(1, $w * $scale)
    $th = [int][Math]::Max(1, $h * $scale)
    $scaled = New-Object System.Drawing.Bitmap($tw, $th)
    $sg = [System.Drawing.Graphics]::FromImage($scaled)
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.DrawImage($bmp, 0, 0, $tw, $th)
    $sg.Dispose()
    $bmp.Dispose()
    $bmp = $scaled
  }

  $stream = New-Object System.IO.MemoryStream
  $bmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $width = $bmp.Width
  $height = $bmp.Height
  $stream.Dispose()
  $bmp.Dispose()
  return @{
    base64 = [Convert]::ToBase64String($bytes)
    width = $width
    height = $height
    bounds = @{ x = $x; y = $y; width = $w; height = $h }
  }
}

function Initialize-Ocr {
  if ($script:OCR_READY) { return }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
  [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.DataWriter, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  $script:AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
  if ($null -eq $script:AsTaskGeneric) {
    Throw-Coded 'ocr_unavailable' 'WinRT async support is unavailable in this PowerShell'
  }
  $script:OCR_READY = $true
}

function Await-WinRt($operation, [Type]$resultType) {
  $asTask = $script:AsTaskGeneric.MakeGenericMethod($resultType)
  $task = $asTask.Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

function Get-OcrLanguageTags {
  $tags = New-Object System.Collections.ArrayList
  foreach ($language in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) {
    [void]$tags.Add([string]$language.LanguageTag)
  }
  return @($tags)
}

function Get-OcrData($p) {
  Initialize-Ocr
  $capture = Get-CaptureRect $p
  $scale = 1.0
  if ($null -ne $p.scale) { $scale = [double]$p.scale }
  if ($scale -lt 0.1) { $scale = 0.1 }
  if ($scale -gt 1.0) { $scale = 1.0 }

  $sourceW = $capture.width
  $sourceH = $capture.height
  $bmp = New-Object System.Drawing.Bitmap($sourceW, $sourceH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.CopyFromScreen($capture.x, $capture.y, 0, 0, (New-Object System.Drawing.Size($sourceW, $sourceH)))
  $graphics.Dispose()

  $factor = 1.0
  if ($scale -lt 1.0) {
    $tw = [int][Math]::Max(1, $sourceW * $scale)
    $th = [int][Math]::Max(1, $sourceH * $scale)
    $scaled = New-Object System.Drawing.Bitmap($tw, $th)
    $sg = [System.Drawing.Graphics]::FromImage($scaled)
    $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $sg.DrawImage($bmp, 0, 0, $tw, $th)
    $sg.Dispose()
    $bmp.Dispose()
    $bmp = $scaled
    $factor = $tw / [double]$sourceW
  }

  $stream = New-Object System.IO.MemoryStream
  $bmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $bitmapWidth = $bmp.Width
  $bitmapHeight = $bmp.Height
  $stream.Dispose()
  $bmp.Dispose()

  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { Throw-Coded 'ocr_unavailable' 'no OCR engine is installed for the current user language' }

  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  $winStream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
  $writer = [Windows.Storage.Streams.DataWriter]::new($winStream)
  $writer.WriteBytes($bytes)
  $null = Await-WinRt ($writer.StoreAsync()) ([uint32])
  $null = $writer.DetachStream()
  $winStream.Seek(0)
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($winStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $softwareBitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $ocrResult = Await-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
  $watch.Stop()

  $lines = New-Object System.Collections.ArrayList
  foreach ($line in $ocrResult.Lines) {
    $text = [string]$line.Text
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    $minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = 0.0; $maxY = 0.0
    $words = New-Object System.Collections.ArrayList
    foreach ($word in $line.Words) {
      $r = $word.BoundingRect
      if ($r.Width -le 0 -or $r.Height -le 0) { continue }
      if ($r.X -lt $minX) { $minX = $r.X }
      if ($r.Y -lt $minY) { $minY = $r.Y }
      if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
      if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
      [void]$words.Add(@{
        text = [string]$word.Text
        bounds = @{
          x = [int]($capture.x + $r.X / $factor)
          y = [int]($capture.y + $r.Y / $factor)
          width = [int]($r.Width / $factor)
          height = [int]($r.Height / $factor)
        }
      })
    }
    if ($words.Count -eq 0) { continue }
    [void]$lines.Add(@{
      text = $text
      bounds = @{
        x = [int]($capture.x + $minX / $factor)
        y = [int]($capture.y + $minY / $factor)
        width = [int](($maxX - $minX) / $factor)
        height = [int](($maxY - $minY) / $factor)
      }
      words = @($words)
    })
  }

  $textLines = @($lines | ForEach-Object { $_.text })
  return @{
    lines = @($lines)
    text = ($textLines -join "`n")
    language = [string]$engine.RecognizerLanguage.LanguageTag
    languages = @(Get-OcrLanguageTags)
    width = $bitmapWidth
    height = $bitmapHeight
    bounds = @{ x = $capture.x; y = $capture.y; width = $sourceW; height = $sourceH }
    elapsed_ms = [int]$watch.ElapsedMilliseconds
  }
}

function Get-ProcessList {
  $list = New-Object System.Collections.ArrayList
  try {
    foreach ($proc in (Get-Process | Sort-Object -Property Id | Select-Object -First 400)) {
      $path = ''
      try { $path = [string]$proc.Path } catch { }
      [void]$list.Add(@{ pid = [int]$proc.Id; name = [string]$proc.ProcessName; path = $path })
    }
  } catch { }
  return $list
}

function Get-InstalledApps {
  $keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $seen = @{}
  $list = New-Object System.Collections.ArrayList
  foreach ($key in $keys) {
    try {
      $items = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
      foreach ($item in $items) {
        if (-not $item.DisplayName) { continue }
        $name = [string]$item.DisplayName
        $version = ''
        if ($item.DisplayVersion) { $version = [string]$item.DisplayVersion }
        $key2 = $name + '|' + $version
        if ($seen.ContainsKey($key2)) { continue }
        $seen[$key2] = $true
        $vendor = ''
        if ($item.Publisher) { $vendor = [string]$item.Publisher }
        $location = ''
        if ($item.InstallLocation) { $location = [string]$item.InstallLocation }
        [void]$list.Add(@{ name = $name; version = $version; vendor = $vendor; install_location = $location; source = 'registry' })
        if ($list.Count -ge 1000) { break }
      }
    } catch { }
    if ($list.Count -ge 1000) { break }
  }
  return $list
}

function Invoke-Method($method, $p) {
  switch ($method) {
    'ping' {
      $cursor = [AbNative]::CursorPosition()
      $fg = [AbNative]::GetForegroundWindow()
      return @{
        ok = $true
        platform = 'windows'
        psVersion = $PSVersionTable.PSVersion.ToString()
        dpiAware = $true
        windowCount = $script:WINDOWS.Count
        foreground = [string]$fg.ToInt64()
        cursor = @{ x = $cursor.X; y = $cursor.Y }
      }
    }
    'list_windows' {
      $windows = Update-Windows
      return @{ windows = @($windows) }
    }
    'get_tree' { return (Get-TreeData $p) }
    'focus_window' {
      $entry = Resolve-Window $p.windowId
      [AbNative]::FocusWindow($entry.Hwnd)
      Start-Sleep -Milliseconds 120
      $pub = Get-PublicWindow $entry
      $fg = [AbNative]::GetForegroundWindow()
      if (-not $pub.focused) {
        $cx = [int]($pub.bounds.x + $pub.bounds.width  / 2)
        $cy = [int]($pub.bounds.y + $pub.bounds.height / 2)
        if ($cx -gt 0 -and $cy -gt 0) {
          [AbNative]::ClickButton($cx, $cy, 0, 1)
          Start-Sleep -Milliseconds 180
          $pub = Get-PublicWindow $entry
          $fg = [AbNative]::GetForegroundWindow()
        }
      }
      if (($pub.focused) -or ($fg -eq [IntPtr]::Zero -and $pub.visible -and -not $pub.minimized)) {
        $pub.focused = $true
      }
      return $pub
    }
    'window_action' {
      $entry = Resolve-Window $p.windowId
      $action = [string]$p.action
      switch ($action) {
        'focus' { [AbNative]::FocusWindow($entry.Hwnd) }
        'minimize' { [AbNative]::ShowWindow($entry.Hwnd, 6) | Out-Null }
        'maximize' { [AbNative]::ShowWindow($entry.Hwnd, 3) | Out-Null }
        'restore' { [AbNative]::ShowWindow($entry.Hwnd, 9) | Out-Null }
        'close' { [AbNative]::CloseWindow($entry.Hwnd) | Out-Null }
        'move_resize' {
          [AbNative]::MoveResize($entry.Hwnd, [int]$p.x, [int]$p.y, [int]$p.width, [int]$p.height)
        }
        default { Throw-Coded 'bad_request' ('unknown window action ' + $action) }
      }
      Start-Sleep -Milliseconds 120
      return @{ action = $action; window = (Get-PublicWindow $entry) }
    }
    'click' {
      $button = 0
      if ($null -ne $p.button) {
        if ($p.button -eq 'right') { $button = 1 }
        elseif ($p.button -eq 'middle') { $button = 2 }
      }
      $count = 1
      if ($null -ne $p.count) { $count = [int]$p.count }
      [AbNative]::ClickButton([int]$p.x, [int]$p.y, $button, $count)
      return @{ x = [int]$p.x; y = [int]$p.y; button = $button; count = $count }
    }
    'move' {
      [AbNative]::MoveTo([int]$p.x, [int]$p.y)
      return @{ x = [int]$p.x; y = [int]$p.y }
    }
    'drag' {
      $x1 = [int]$p.fromX; $y1 = [int]$p.fromY; $x2 = [int]$p.toX; $y2 = [int]$p.toY
      [AbNative]::MoveTo($x1, $y1)
      Start-Sleep -Milliseconds 60
      [AbNative]::MouseDown(0)
      $steps = 12
      for ($i = 1; $i -le $steps; $i++) {
        $nx = [int]($x1 + ($x2 - $x1) * $i / $steps)
        $ny = [int]($y1 + ($y2 - $y1) * $i / $steps)
        [AbNative]::MoveTo($nx, $ny)
        Start-Sleep -Milliseconds 25
      }
      [AbNative]::MouseUp(0)
      return @{ fromX = $x1; fromY = $y1; toX = $x2; toY = $y2 }
    }
    'scroll' {
      $amount = 3
      if ($null -ne $p.amount) { $amount = [int]$p.amount }
      if ($null -ne $p.x -and $null -ne $p.y) { [AbNative]::MoveTo([int]$p.x, [int]$p.y) }
      $delta = -120 * $amount
      if ($p.direction -eq 'up') { $delta = 120 * $amount }
      if ($p.direction -eq 'left') { $delta = -120 * $amount }
      if ($p.direction -eq 'right') { $delta = 120 * $amount }
      [AbNative]::Wheel($delta)
      return @{ direction = [string]$p.direction; amount = $amount }
    }
    'type_text' {
      [AbNative]::TypeText([string]$p.text)
      return @{ length = ([string]$p.text).Length }
    }
    'key' {
      $codes = @()
      foreach ($code in $p.codes) { $codes += [int]$code }
      if ($codes.Length -eq 0) { Throw-Coded 'bad_request' 'no key codes supplied' }
      [AbNative]::KeyCombo($codes)
      return @{ codes = $codes }
    }
    'invoke' { return (Invoke-Element $p.uid) }
    'set_value' { return (Set-ElementValue $p.uid $p.value) }
    'focus_element' {
      $el = Get-ElementByUid $p.uid
      $el.SetFocus()
      return @{ uid = [string]$p.uid }
    }
    'element_at' {
      $point = New-Object System.Windows.Point([double]$p.x, [double]$p.y)
      $el = [System.Windows.Automation.AutomationElement]::FromPoint($point)
      if ($null -eq $el) { Throw-Coded 'not_found' 'no element at that point' }
      $info = Get-ElementInfo $el 0 $null 'point' 0 $true
      if ($null -eq $info) { Throw-Coded 'not_found' 'no element at that point' }
      return $info
    }
    'capture' { return (Get-CaptureData $p) }
    'ocr' { return (Get-OcrData $p) }
    'ocr_languages' {
      Initialize-Ocr
      return @{
        languages = @(Get-OcrLanguageTags)
        max_dimension = [int][Windows.Media.Ocr.OcrEngine]::MaxImageDimension
      }
    }
    'clipboard_get' {
      $text = ''
      try { $text = [string][System.Windows.Forms.Clipboard]::GetText() } catch { Throw-Coded 'clipboard_failed' $_.Exception.Message }
      return @{ text = $text }
    }
    'clipboard_set' {
      try { [System.Windows.Forms.Clipboard]::SetText([string]$p.text) } catch { Throw-Coded 'clipboard_failed' $_.Exception.Message }
      return @{ length = ([string]$p.text).Length }
    }
    'process_list' { return @{ processes = @(Get-ProcessList) } }
    'installed_apps' { return @{ apps = @(Get-InstalledApps) } }
    'launch_app' {
      $args = @()
      if ($null -ne $p.args) { foreach ($a in $p.args) { $args += [string]$a } }
      if ($args.Length -gt 0) {
        $proc = Start-Process -FilePath ([string]$p.path) -ArgumentList $args -PassThru
      } else {
        $proc = Start-Process -FilePath ([string]$p.path) -PassThru
      }
      return @{ pid = [int]$proc.Id }
    }
    default { Throw-Coded 'unknown_method' ('unknown method: ' + $method) }
  }
  return @{ ok = $true }
}

[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = $null
  try {
    $req = $line | ConvertFrom-Json
    $id = [string]$req.id
    $method = [string]$req.method
    $params = $req.params
    if ($null -eq $params) { $params = [pscustomobject]@{} }
    $data = Invoke-Method $method $params
    Write-Protocol @{ id = $id; ok = $true; data = $data }
  } catch {
    $message = $_.Exception.Message
    $code = 'host_error'
    if ($message -match '^\[([a-z_]+)\]\s*(.*)$') {
      $code = $Matches[1]
      $message = $Matches[2]
    }
    Write-Protocol @{ id = $id; ok = $false; error = @{ code = $code; message = $message } }
  }
}
