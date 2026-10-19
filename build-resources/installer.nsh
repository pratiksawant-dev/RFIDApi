!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

Var SparkleDlg
Var SparkleStep1
Var SparkleStep2
Var SparkleStep3
Var SparkleStep4
Var SparkleTick

!macro customHeader
  BrandingText "Sparkle RFID"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Sparkle RFID"
  !define MUI_WELCOMEPAGE_TEXT "This setup copies the Sparkle RFID dashboard and the tray reader onto this laptop.$\r$\n$\r$\nIt usually finishes in about a minute. You can open the app as soon as the files are in place.$\r$\n$\r$\nNext: choose the folder, then a short RFID checklist."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  Function sparklePaintSteps
    SetCtlColors $SparkleStep1 0x111111 0xFFFFFF
    SetCtlColors $SparkleStep2 0x111111 0xFFFFFF
    SetCtlColors $SparkleStep3 0x111111 0xFFFFFF
    SetCtlColors $SparkleStep4 0x111111 0xFFFFFF
    IntOp $0 $SparkleTick % 4
    ${If} $0 == 0
      SetCtlColors $SparkleStep1 0x005F9DC5 0xFFFFFF
    ${ElseIf} $0 == 1
      SetCtlColors $SparkleStep2 0x005F9DC5 0xFFFFFF
    ${ElseIf} $0 == 2
      SetCtlColors $SparkleStep3 0x005F9DC5 0xFFFFFF
    ${Else}
      SetCtlColors $SparkleStep4 0x005F9DC5 0xFFFFFF
    ${EndIf}
  FunctionEnd

  Function sparkleGuideTick
    IntOp $SparkleTick $SparkleTick + 1
    Call sparklePaintSteps
  FunctionEnd

  Function sparkleGuideCreate
    !insertmacro MUI_HEADER_TEXT "RFID on this laptop" "Four steps. The file copy stays quick."
    nsDialogs::Create 1018
    Pop $SparkleDlg
    SetCtlColors $SparkleDlg 0x111111 0xFFFFFF

    ${NSD_CreateLabel} 0 0 100% 12u "Before you open Sparkle RFID"
    Pop $0
    CreateFont $1 "Segoe UI" 11 700
    SendMessage $0 ${WM_SETFONT} $1 1
    SetCtlColors $0 0x111111 0xFFFFFF

    ${NSD_CreateLabel} 0 18u 100% 12u "1    Connect the RFID tray with the USB cable."
    Pop $SparkleStep1
    ${NSD_CreateLabel} 0 32u 100% 12u "2    Sign in with your client code."
    Pop $SparkleStep2
    ${NSD_CreateLabel} 0 46u 100% 12u "3    Keep one tag flat on the tray to read or write."
    Pop $SparkleStep3
    ${NSD_CreateLabel} 0 60u 100% 16u "4    The reader bridge is copied with this setup."
    Pop $SparkleStep4

    StrCpy $SparkleTick 0
    Call sparklePaintSteps
    ${NSD_CreateTimer} sparkleGuideTick 700
    nsDialogs::Show
  FunctionEnd

  Function sparkleGuideLeave
    ${NSD_KillTimer} sparkleGuideTick
  FunctionEnd

  Page custom sparkleGuideCreate sparkleGuideLeave
!macroend

!macro customFinishPage
  Function SparkleStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Sparkle RFID is ready"
  !define MUI_FINISHPAGE_TEXT "The dashboard and the RFID reader are installed on this laptop.$\r$\n$\r$\nOpen Sparkle RFID and sign in with your client code. Connect the tray with the USB cable. Keep one tag flat on the tray when you read or write.$\r$\n$\r$\nA shortcut was added to the desktop and the Start menu."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "SparkleStartApp"
  !define MUI_FINISHPAGE_RUN_TEXT "Open Sparkle RFID"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove Sparkle RFID"
  !define MUI_WELCOMEPAGE_TEXT "This removes the Sparkle RFID dashboard and the reader bridge from this laptop. Stock stored on the server is left as it is."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
