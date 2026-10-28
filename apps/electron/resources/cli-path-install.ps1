param(
  [ValidateSet('Add','Remove','PreviewAdd','PreviewRemove')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Bin,
  [string]$Value = ''
)
$ErrorActionPreference = 'Stop'
function Normalize-RoyEntry([string]$Entry) {
  return $Entry.Trim().Trim('"').TrimEnd('\','/').ToLowerInvariant()
}
function Get-RoyPathValue([string]$Original, [string]$Directory, [bool]$Add) {
  $entries = @($Original -split ';')
  $match = Normalize-RoyEntry $Directory
  $present = @($entries | Where-Object { (Normalize-RoyEntry $_) -eq $match }).Count -gt 0
  if ($Add) {
    if ($present) { return $Original }
    if (!$Original) { return $Directory }
    if ($Original.EndsWith(';')) { return $Original + $Directory }
    return $Original + ';' + $Directory
  }
  return (@($entries | Where-Object { (Normalize-RoyEntry $_) -ne $match }) -join ';')
}
if ($Mode -eq 'PreviewAdd' -or $Mode -eq 'PreviewRemove') {
  $next = Get-RoyPathValue $Value $Bin ($Mode -eq 'PreviewAdd')
  @{ Value = $next; Changed = ($next -cne $Value) } | ConvertTo-Json -Compress
  exit 0
}
$key = 'HKCU:\Software\Roy\CliPathInstaller'
$envKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true)
if (!$envKey) { $envKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment') }
try {
  $original = [string]$envKey.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
  if ($envKey.GetValueNames() -contains 'Path') { $kind = $envKey.GetValueKind('Path') }
  if ($Mode -eq 'Add') {
    if (!(Test-Path -LiteralPath (Join-Path $Bin 'roy.exe'))) { throw 'Roy CLI executable not found' }
    $next = Get-RoyPathValue $original $Bin $true
    if ($next -cne $original) {
      $envKey.SetValue('Path',$next,$kind)
      New-Item -Path $key -Force | Out-Null
      New-ItemProperty -Path $key -Name $Bin -Value 1 -PropertyType DWord -Force | Out-Null
    }
  } else {
    $managed = Get-ItemProperty -LiteralPath $key -Name $Bin -ErrorAction SilentlyContinue
    if (!$managed) { exit 0 }
    $next = Get-RoyPathValue $original $Bin $false
    if ($next -cne $original) { $envKey.SetValue('Path',$next,$kind) }
    Remove-ItemProperty -LiteralPath $key -Name $Bin -ErrorAction SilentlyContinue
  }
} finally { $envKey.Dispose() }
# Notify Explorer/newly launched terminals without changing the running terminal's environment.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RoyEnvironmentNotify {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wparam, string lparam, uint flags, uint timeout, out UIntPtr result);
}
'@
[UIntPtr]$result = [UIntPtr]::Zero
[void][RoyEnvironmentNotify]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,2000,[ref]$result)
Write-Output 'Roy user PATH updated. Open a new terminal to use roy help.'
