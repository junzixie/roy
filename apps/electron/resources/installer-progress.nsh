!include MUI2.nsh
!include nsDialogs.nsh
!include LogicLib.nsh
!macro customHeader
  ShowInstDetails show
!macroend
!ifndef BUILD_UNINSTALLER
Var RoyCliCheckbox
Var RoyCliChoice
Function RoyCliOptionsShow
  !insertmacro MUI_HEADER_TEXT "命令行工具（可选）" "选择是否在终端中启用 roy 命令"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 8u 100% 36u "Roy 可提供命令行工具。勾选下方选项后，将仅把本次安装的 resources\bin 目录添加到当前用户 PATH，不修改系统 PATH。"
  Pop $0
  ${NSD_CreateCheckbox} 0 52u 100% 18u "将 Roy 命令行工具加入当前用户 PATH（可选）"
  Pop $RoyCliCheckbox
  ${NSD_SetState} $RoyCliCheckbox $RoyCliChoice
  ${NSD_CreateLabel} 0 83u 100% 42u "默认不勾选。升级时保留已有 PATH。安装完成后请新开终端，输入 roy help。也可稍后在 Roy 的「权限设置 → 命令行工具」中调整。"
  Pop $0
  nsDialogs::Show
FunctionEnd
Function RoyCliOptionsLeave
  ${NSD_GetState} $RoyCliCheckbox $RoyCliChoice
FunctionEnd
!endif
!macro customPageAfterChangeDir
  Page custom RoyCliOptionsShow RoyCliOptionsLeave
!macroend
!macro customInit
  StrCpy $RoyCliChoice ${BST_UNCHECKED}
!macroend
!macro customInstall
  SetDetailsView show
  SetDetailsPrint both
  DetailPrint "Roy 文件已写入，正在完成安装…"
  ${If} $RoyCliChoice == ${BST_CHECKED}
    DetailPrint "正在添加 Roy 命令行到当前用户 PATH…"
    nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli-path-install.ps1" -Mode Add -Bin "$INSTDIR\resources\bin"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      DetailPrint "PATH 未能更新：$1"
      MessageBox MB_OK|MB_ICONEXCLAMATION "Roy 已安装，但 PATH 未能更新。可在「权限设置 → 命令行工具」中重试。"
    ${Else}
      DetailPrint "已加入当前用户 PATH，请新开终端使用 roy help。"
    ${EndIf}
  ${EndIf}
!macroend
!macro customUnInstall
  ${IfNot} ${isUpdated}
    InitPluginsDir
    File /oname=$PLUGINSDIR\roy-cli-path.ps1 "${BUILD_RESOURCES_DIR}\cli-path-install.ps1"
    nsExec::ExecToStack /TIMEOUT=30000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\roy-cli-path.ps1" -Mode Remove -Bin "$INSTDIR\resources\bin"'
    Pop $0
    Pop $1
    DetailPrint "已处理本安装器登记的 Roy PATH 条目。"
  ${EndIf}
!macroend
