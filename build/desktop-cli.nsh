; Desktop-only command binding. No child process, server or service operation.
!include LogicLib.nsh
!include StrFunc.nsh
!include WinMessages.nsh
!include "${BUILD_RESOURCES_DIR}\desktop-cli-config.nsh"

!define PORACODE_CLI_REGISTRATION_VERSION 1
!ifndef PORACODE_CLI_ENV_KEY
  !define PORACODE_CLI_ENV_KEY "Environment"
!endif
!ifndef PORACODE_CLI_REG_KEY
  !define PORACODE_CLI_REG_KEY "Software\Poracode\DesktopCli\${PORACODE_CLI_CHANNEL}"
!endif
!ifndef PORACODE_CLI_MUTEX_PREFIX
  !define PORACODE_CLI_MUTEX_PREFIX "PoracodeDesktopCli"
!endif
!ifdef BUILD_UNINSTALLER
  !define PORACODE_CLI_PREFIX "un."
  ${UnStrTok}
  !define PORACODE_CLI_TOKEN "${UnStrTok}"
!else
  !define PORACODE_CLI_PREFIX ""
  ${StrTok}
  !define PORACODE_CLI_TOKEN "${StrTok}"
!endif

!include "${BUILD_RESOURCES_DIR}\desktop-cli-owner.nsh"

Var PoraCliAction
Var PoraCliPerUser
Var PoraCliResult
Var PoraCliReason
Var PoraCliPrefix
Var PoraCliEntry
Var PoraCliSid
Var PoraCliMutex
Var PoraCliRecord
Var PoraCliNextRecord
Var PoraCliId
Var PoraCliRecordSid
Var PoraCliState
Var PoraCliRecordPrefix
Var PoraCliCommand
Var PoraCliHash
Var PoraCliAdded
Var PoraCliOriginalKind
Var PoraCliOriginalPresent
Var PoraCliKey
Var PoraCliFlags
Var PoraCliReadRaw
Var PoraCliReadKind
Var PoraCliReadStatus
Var PoraCliOldRaw
Var PoraCliOldKind
Var PoraCliOldPresent
Var PoraCliNextRaw
Var PoraCliNextPresent
Var PoraCliIndex
Var PoraCliStart
Var PoraCliLength
Var PoraCliToken
Var PoraCliCount
Var PoraCliKept
Var PoraCliOk
; RegGetValueW supplies one complete bounded UTF-16 snapshot. Never expand or
; accept MORE_DATA: an NSIS string truncation must not become a PATH rewrite.
Function ${PORACODE_CLI_PREFIX}PoraCliRead
  StrCpy $0 $PoraCliKey
  IntOp $2 ${NSIS_MAX_STRLEN} * 2
  System::Call 'advapi32::RegGetValueW(p 0x80000001, w r0, w "Path", i $PoraCliFlags, *i .r3, w .r1, *i r2r2) i.r4'
  StrCpy $PoraCliReadStatus $4
  StrCpy $PoraCliReadRaw $1
  StrCpy $PoraCliReadKind $3
  ${If} $4 == 0
    StrLen $5 $1
    IntOp $5 $5 + 1
    IntOp $5 $5 * 2
    ${If} $5 != $2
      StrCpy $PoraCliReadStatus 13
    ${EndIf}
  ${EndIf}
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliReadRecord
  IntOp $2 ${NSIS_MAX_STRLEN} * 2
  System::Call 'advapi32::RegGetValueW(p 0x80000001, w "${PORACODE_CLI_REG_KEY}", w "Registration", i 0x30020002, *i .r3, w .r1, *i r2r2) i.r4'
  StrCpy $PoraCliReadStatus $4
  StrCpy $PoraCliReadRaw $1
  ${If} $4 == 0
    StrLen $5 $1
    IntOp $5 $5 + 1
    IntOp $5 $5 * 2
    ${If} $5 != $2
      StrCpy $PoraCliReadStatus 13
    ${EndIf}
  ${EndIf}
  ; An unknown value layout under this dedicated key is also a future writer.
  System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "${PORACODE_CLI_REG_KEY}", i 0, i 0x201, *p .r5) i.r4'
  ${If} $4 == 0
    System::Call 'advapi32::RegQueryInfoKeyW(p r5, p 0, p 0, p 0, *i .r7, p 0, p 0, *i .r6, p 0, p 0, p 0, p 0) i.r4'
    System::Call 'advapi32::RegCloseKey(p r5)'
    ${If} $4 != 0
      StrCpy $PoraCliReadStatus $4
    ${ElseIf} $7 != 0
      StrCpy $PoraCliReadStatus 1804
    ${ElseIf} $PoraCliReadStatus == 0
      ${If} $6 != 1
        StrCpy $PoraCliReadStatus 1804
      ${EndIf}
    ${ElseIf} $6 != 0
      StrCpy $PoraCliReadStatus 1804
    ${EndIf}
  ${ElseIf} $4 != 2
    StrCpy $PoraCliReadStatus $4
  ${EndIf}
FunctionEnd

; All writes compare a fresh record. Other registry writers do not participate
; in our mutex; Win32 registry calls are not an external compare-and-swap.
Function ${PORACODE_CLI_PREFIX}PoraCliWriteRecord
  StrCpy $PoraCliOk 0
  Call ${PORACODE_CLI_PREFIX}PoraCliReadRecord
  ${If} $PoraCliReadStatus == 2
    StrCpy $PoraCliReadRaw ""
  ${ElseIf} $PoraCliReadStatus != 0
    Return
  ${EndIf}
  StrCmpS $PoraCliReadRaw $PoraCliRecord 0 done
  System::Call 'advapi32::RegCreateKeyExW(p 0x80000001, w "${PORACODE_CLI_REG_KEY}", i 0, p 0, i 0, i 0x203, p 0, *p .r5, p 0) i.r4'
  ${If} $4 != 0
    Return
  ${EndIf}
  ${If} $PoraCliNextRecord == ""
    System::Call 'advapi32::RegDeleteValueW(p r5, w "Registration") i.r4'
  ${Else}
    StrCpy $0 $PoraCliNextRecord
    StrLen $2 $0
    IntOp $2 $2 + 1
    IntOp $2 $2 * 2
    System::Call 'advapi32::RegSetValueExW(p r5, w "Registration", i 0, i 1, w r0, i r2) i.r4'
  ${EndIf}
  StrCpy $6 $4
  System::Call 'advapi32::RegFlushKey(p r5) i.r4'
  System::Call 'advapi32::RegCloseKey(p r5)'
  ${If} $6 != 0
  ${OrIf} $4 != 0
    Return
  ${EndIf}
  StrCpy $PoraCliRecord $PoraCliNextRecord
  Call ${PORACODE_CLI_PREFIX}PoraCliReadRecord
  ${If} $PoraCliReadStatus == 2
    StrCpy $PoraCliReadRaw ""
  ${ElseIf} $PoraCliReadStatus != 0
    Return
  ${EndIf}
  StrCmpS $PoraCliReadRaw $PoraCliRecord 0 done
  StrCpy $PoraCliOk 1
  done:
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliReadPath
  StrCpy $PoraCliKey "${PORACODE_CLI_ENV_KEY}"
  StrCpy $PoraCliFlags 0x30000006
  Call ${PORACODE_CLI_PREFIX}PoraCliRead
  ${If} $PoraCliReadStatus == 2
    StrCpy $PoraCliReadRaw ""
    StrCpy $PoraCliReadKind 2
  ${EndIf}
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliWritePath
  StrCpy $PoraCliOk 0
  Call ${PORACODE_CLI_PREFIX}PoraCliReadRecord
  StrCmp $PoraCliReadStatus 0 0 done
  StrCmpS $PoraCliReadRaw $PoraCliRecord 0 done
  Call ${PORACODE_CLI_PREFIX}PoraCliReadPath
  ${If} $PoraCliReadStatus != 0
  ${AndIf} $PoraCliReadStatus != 2
    Return
  ${EndIf}
  StrCmpS $PoraCliReadRaw $PoraCliOldRaw 0 done
  StrCmp $PoraCliReadKind $PoraCliOldKind 0 done
  ${If} $PoraCliOldPresent == 1
    ${If} $PoraCliReadStatus != 0
      Return
    ${EndIf}
  ${ElseIf} $PoraCliReadStatus != 2
    Return
  ${EndIf}
  System::Call 'advapi32::RegCreateKeyExW(p 0x80000001, w "${PORACODE_CLI_ENV_KEY}", i 0, p 0, i 0, i 3, p 0, *p .r5, p 0) i.r4'
  ${If} $4 != 0
    Return
  ${EndIf}
  ${If} $PoraCliNextPresent == 0
    System::Call 'advapi32::RegDeleteValueW(p r5, w "Path") i.r4'
  ${Else}
    StrCpy $0 $PoraCliNextRaw
    StrLen $2 $0
    IntOp $2 $2 + 1
    IntOp $2 $2 * 2
    System::Call 'advapi32::RegSetValueExW(p r5, w "Path", i 0, i $PoraCliOldKind, w r0, i r2) i.r4'
  ${EndIf}
  StrCpy $6 $4
  System::Call 'advapi32::RegFlushKey(p r5) i.r4'
  System::Call 'advapi32::RegCloseKey(p r5)'
  ${If} $6 != 0
  ${OrIf} $4 != 0
    Return
  ${EndIf}
  Call ${PORACODE_CLI_PREFIX}PoraCliReadPath
  ${If} $PoraCliNextPresent == 0
    ${If} $PoraCliReadStatus != 2
      Return
    ${EndIf}
  ${Else}
    ${If} $PoraCliReadStatus != 0
      Return
    ${EndIf}
    StrCmpS $PoraCliReadRaw $PoraCliNextRaw 0 done
    StrCmp $PoraCliReadKind $PoraCliOldKind 0 done
  ${EndIf}
  StrCpy $PoraCliOk 1
  done:
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliAccount
  StrCpy $PoraCliSid ""
  System::Call 'advapi32::OpenProcessToken(p -1, i 8, *p .r0) i.r1'
  ${If} $1 == 0
    Return
  ${EndIf}
  System::Call 'advapi32::GetTokenInformation(p r0, i 1, p 0, i 0, *i .r2)'
  System::Alloc $2
  Pop $3
  ${If} $3 != 0
    System::Call 'advapi32::GetTokenInformation(p r0, i 1, p r3, i r2, *i .r2) i.r1'
    ${If} $1 != 0
      System::Call '*$3(p .r4)'
      System::Call 'advapi32::ConvertSidToStringSidW(p r4, *p .r5) i.r1'
      ${If} $1 != 0
        System::Call '*$5(&w${NSIS_MAX_STRLEN} .r6)'
        StrCpy $PoraCliSid $6
        System::Call 'kernel32::LocalFree(p r5)'
      ${EndIf}
    ${EndIf}
    System::Free $3
  ${EndIf}
  System::Call 'kernel32::CloseHandle(p r0)'
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliBuildRecord
  StrCpy $PoraCliNextRecord "${PORACODE_CLI_REGISTRATION_VERSION}|$PoraCliId|$PoraCliSid|$PoraCliState|$PoraCliPrefix|${PORACODE_CLI_COMMAND}|${PORACODE_CLI_LAUNCHER_SHA256}|$PoraCliAdded|$PoraCliOriginalKind|$PoraCliOriginalPresent"
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliCheckPrefix
  StrCpy $PoraCliOk 0
  StrCpy $0 $PoraCliPrefix
  System::Call 'kernel32::CreateFileW(w r0, i 0, i 7, p 0, i 3, i 0x02000000, p 0) p.r1'
  IntCmp $1 -1 done
  System::Call 'kernel32::GetFinalPathNameByHandleW(p r1, w .r2, i ${NSIS_MAX_STRLEN}, i 0) i.r3'
  System::Call 'kernel32::CloseHandle(p r1)'
  IntCmp $3 0 done done
  IntCmp $3 ${NSIS_MAX_STRLEN} done 0 done
  StrCpy $0 $2 4
  StrCmp $0 "\\?\" 0 done
  StrCpy $2 $2 "" 4
  StrCmp $2 $PoraCliPrefix 0 done
  StrCpy $0 "$PoraCliPrefix\resources"
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntOp $1 $1 & 0x400
  StrCmp $1 0 0 done
  StrCpy $0 $PoraCliEntry
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntOp $1 $1 & 0x400
  StrCmp $1 0 0 done
  StrCpy $0 "$PoraCliEntry\${PORACODE_CLI_COMMAND}.cmd"
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntOp $1 $1 & 0x410
  StrCmp $1 0 0 done
  StrCpy $PoraCliOk 1
  done:
FunctionEnd

; Scan raw components, preserving empty/trailing components and every unrelated
; byte. Only the exact absolute entry written by this installation is removable.
Function ${PORACODE_CLI_PREFIX}PoraCliScanPath
  StrCpy $PoraCliCount 0
  StrCpy $PoraCliKept 0
  StrCpy $PoraCliNextRaw ""
  StrCpy $PoraCliStart 0
  StrCpy $PoraCliIndex 0
  StrLen $PoraCliLength $PoraCliOldRaw
  loop:
    StrCpy $0 $PoraCliOldRaw 1 $PoraCliIndex
    ${If} $0 == ";"
    ${OrIf} $PoraCliIndex == $PoraCliLength
      IntOp $0 $PoraCliIndex - $PoraCliStart
      StrCpy $PoraCliToken $PoraCliOldRaw $0 $PoraCliStart
      ${If} $PoraCliToken == $PoraCliEntry
        IntOp $PoraCliCount $PoraCliCount + 1
      ${Else}
        ${If} $PoraCliKept != 0
          StrCpy $PoraCliNextRaw "$PoraCliNextRaw;"
        ${EndIf}
        StrCpy $PoraCliNextRaw "$PoraCliNextRaw$PoraCliToken"
        IntOp $PoraCliKept $PoraCliKept + 1
      ${EndIf}
      IntOp $PoraCliStart $PoraCliIndex + 1
    ${EndIf}
    IntOp $PoraCliIndex $PoraCliIndex + 1
    IntCmp $PoraCliIndex $PoraCliLength loop loop
FunctionEnd

Function ${PORACODE_CLI_PREFIX}PoraCliManage
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  Push $9
  StrCpy $PoraCliMutex 0
  StrCpy $PoraCliResult "refused"
  StrCpy $PoraCliReason "The selected installation path is aliased, unrepresentable or outside the supported native bounds."
  ${If} $PoraCliPerUser != 1
    StrCpy $PoraCliResult "skipped"
    DetailPrint "Desktop CLI: per-user registration skipped for an all-users installation."
    Goto done
  ${EndIf}
  GetFullPathName $PoraCliPrefix "$INSTDIR"
  StrCpy $PoraCliEntry "$PoraCliPrefix\resources\desktop-cli"
  StrLen $0 $PoraCliPrefix
  IntOp $1 ${NSIS_MAX_STRLEN} - 512
  IntCmp $0 $1 refused 0 refused
  ${PORACODE_CLI_TOKEN} $0 $PoraCliPrefix ";" 0 0
  StrCmpS $0 $PoraCliPrefix 0 refused
  Call ${PORACODE_CLI_PREFIX}PoraCliCheckPrefix
  StrCmp $PoraCliOk 1 0 refused
  StrCpy $PoraCliReason "The native installing account could not be verified."
  Call ${PORACODE_CLI_PREFIX}PoraCliAccount
  StrCmp $PoraCliSid "" refused
  StrCpy $PoraCliReason "Another installer owns command registration, or its mutex could not be acquired; retry after it exits."
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Global\${PORACODE_CLI_MUTEX_PREFIX}-$PoraCliSid-${PORACODE_CLI_CHANNEL}") p.r0'
  StrCmp $0 0 refused
  StrCpy $PoraCliMutex $0
  System::Call 'kernel32::WaitForSingleObject(p r0, i 0) i.r1'
  ${If} $1 != 0
  ${AndIf} $1 != 128
    System::Call 'kernel32::CloseHandle(p r0)'
    StrCpy $PoraCliMutex 0
    Goto refused
  ${EndIf}
  StrCpy $PoraCliReason "Existing registration is partial, future, malformed or belongs to another account/installation; preserve it for repair."
  Call ${PORACODE_CLI_PREFIX}PoraCliReadRecord
  StrCpy $PoraCliRecord ""
  StrCpy $PoraCliId ""
  StrCpy $PoraCliAdded 0
  ${If} $PoraCliReadStatus == 0
    StrCpy $PoraCliRecord $PoraCliReadRaw
    ${PORACODE_CLI_TOKEN} $0 $PoraCliRecord "|" 0 0
    StrCmp $0 "${PORACODE_CLI_REGISTRATION_VERSION}" 0 refused
    ${PORACODE_CLI_TOKEN} $PoraCliId $PoraCliRecord "|" 1 0
    ${PORACODE_CLI_TOKEN} $PoraCliRecordSid $PoraCliRecord "|" 2 0
    ${PORACODE_CLI_TOKEN} $PoraCliState $PoraCliRecord "|" 3 0
    ${PORACODE_CLI_TOKEN} $PoraCliRecordPrefix $PoraCliRecord "|" 4 0
    ${PORACODE_CLI_TOKEN} $PoraCliCommand $PoraCliRecord "|" 5 0
    ${PORACODE_CLI_TOKEN} $PoraCliHash $PoraCliRecord "|" 6 0
    ${PORACODE_CLI_TOKEN} $PoraCliAdded $PoraCliRecord "|" 7 0
    ${PORACODE_CLI_TOKEN} $PoraCliOriginalKind $PoraCliRecord "|" 8 0
    ${PORACODE_CLI_TOKEN} $PoraCliOriginalPresent $PoraCliRecord "|" 9 0
    StrCpy $0 "${PORACODE_CLI_REGISTRATION_VERSION}|$PoraCliId|$PoraCliRecordSid|$PoraCliState|$PoraCliRecordPrefix|$PoraCliCommand|$PoraCliHash|$PoraCliAdded|$PoraCliOriginalKind|$PoraCliOriginalPresent"
    StrCmpS $0 $PoraCliRecord 0 refused
    StrCmp $PoraCliRecordSid $PoraCliSid 0 refused
    StrCmp $PoraCliRecordPrefix $PoraCliPrefix 0 refused
    StrCmp $PoraCliCommand "${PORACODE_CLI_COMMAND}" 0 refused
    StrCmpS $PoraCliState "installed" 0 refused
    ${If} $PoraCliAdded != 0
    ${AndIf} $PoraCliAdded != 1
      Goto refused
    ${EndIf}
    ${If} $PoraCliOriginalKind != 1
    ${AndIf} $PoraCliOriginalKind != 2
      Goto refused
    ${EndIf}
    ${If} $PoraCliOriginalPresent != 0
    ${AndIf} $PoraCliOriginalPresent != 1
      Goto refused
    ${EndIf}
    StrLen $0 $PoraCliId
    StrCmp $0 36 0 refused
    StrLen $0 $PoraCliHash
    StrCmp $0 64 0 refused
    System::Alloc 16
    Pop $0
    StrCmp $0 0 refused
    StrCpy $1 "{$PoraCliId}"
    System::Call 'ole32::CLSIDFromString(w r1, p r0) i.r2'
    System::Free $0
    StrCmp $2 0 0 refused
    StrCpy $PoraCliIndex 0
    hash_loop:
      StrCpy $0 $PoraCliHash 1 $PoraCliIndex
      StrCpy $1 0
      hash_character:
        StrCpy $2 "0123456789abcdef" 1 $1
        StrCmpS $0 $2 hash_valid
        IntOp $1 $1 + 1
        IntCmp $1 16 refused hash_character refused
      hash_valid:
      IntOp $PoraCliIndex $PoraCliIndex + 1
      IntCmp $PoraCliIndex 64 0 hash_loop
  ${ElseIf} $PoraCliReadStatus != 2
    Goto refused
  ${EndIf}
  ${If} $PoraCliAction == "remove"
  ${AndIf} $PoraCliRecord == ""
    StrCpy $PoraCliResult "absent"
    Goto done
  ${EndIf}
  StrCpy $PoraCliReason "The installed command differs from this installer's validated bytes; reinstall the matching desktop release before repair."
  ${StdUtils.HashFile} $0 "SHA2-256" "$PoraCliEntry\${PORACODE_CLI_COMMAND}.cmd"
  StrCmp $0 "${PORACODE_CLI_LAUNCHER_SHA256}" 0 refused
  ${If} $PoraCliAction == "remove"
    StrCmp $0 $PoraCliHash 0 refused
  ${EndIf}
  StrCpy $PoraCliReason "User PATH is oversized, has an unsupported registry value, or contains ambiguous duplicate entries; no PATH replacement was confirmed."
  Call ${PORACODE_CLI_PREFIX}PoraCliReadPath
  StrCpy $PoraCliOldPresent 1
  ${If} $PoraCliReadStatus == 2
    StrCpy $PoraCliOldPresent 0
  ${ElseIf} $PoraCliReadStatus != 0
    Goto refused
  ${EndIf}
  StrCpy $PoraCliOldRaw $PoraCliReadRaw
  StrCpy $PoraCliOldKind $PoraCliReadKind
  ${If} $PoraCliAction == "install"
  ${AndIf} $PoraCliOldKind == 2
    ${PORACODE_CLI_TOKEN} $0 $PoraCliEntry "%" 0 0
    ${If} $0 != $PoraCliEntry
      StrCpy $PoraCliReason "A literal percent sign in this install path cannot be safely added to REG_EXPAND_SZ. Use the bundled absolute command or an install path without percent signs."
      Goto refused
    ${EndIf}
  ${EndIf}
  Call ${PORACODE_CLI_PREFIX}PoraCliScanPath
  ${If} $PoraCliCount > 1
    Goto refused
  ${EndIf}
  StrCpy $PoraCliNextPresent 1
  StrCpy $PoraCliReason "A fresh registry snapshot changed or a write was not confirmed; retain the registration evidence and inspect it before retrying."
  ${If} $PoraCliAction == "remove"
    ${If} $PoraCliAdded == 1
    ${AndIf} $PoraCliCount == 1
      ${If} $PoraCliNextRaw == ""
      ${AndIf} $PoraCliOriginalPresent == 0
      ${AndIf} $PoraCliKept == 0
        StrCpy $PoraCliNextPresent 0
      ${EndIf}
      StrCpy $PoraCliState "removing"
      Call ${PORACODE_CLI_PREFIX}PoraCliBuildRecord
      Call ${PORACODE_CLI_PREFIX}PoraCliWriteRecord
      StrCmp $PoraCliOk 1 0 refused
      Call ${PORACODE_CLI_PREFIX}PoraCliWritePath
      StrCmp $PoraCliOk 1 0 refused
    ${EndIf}
    StrCpy $PoraCliNextRecord ""
    Call ${PORACODE_CLI_PREFIX}PoraCliWriteRecord
    StrCmp $PoraCliOk 1 0 refused
    StrCpy $PoraCliResult "removed"
    DetailPrint "Desktop CLI: owned registration removed; pre-existing and unrelated PATH entries were preserved."
  ${Else}
    ${If} $PoraCliId == ""
      System::Alloc 16
      Pop $0
      StrCmp $0 0 refused
      System::Call 'ole32::CoCreateGuid(p r0) i.r1'
      ${If} $1 == 0
        System::Call 'ole32::StringFromGUID2(p r0, w .r2, i ${NSIS_MAX_STRLEN}) i.r1'
        ${If} $1 == 39
          StrCpy $PoraCliId $2 36 1
        ${EndIf}
      ${EndIf}
      System::Free $0
      StrLen $0 $PoraCliId
      StrCmp $0 36 0 refused
    ${EndIf}
    ${If} $PoraCliCount == 0
      StrCpy $PoraCliAdded 1
      StrCpy $PoraCliOriginalKind $PoraCliOldKind
      StrCpy $PoraCliOriginalPresent $PoraCliOldPresent
      StrLen $0 $PoraCliOldRaw
      StrLen $1 $PoraCliEntry
      IntOp $0 $0 + $1
      IntOp $0 $0 + 2
      IntCmp $0 ${NSIS_MAX_STRLEN} refused 0 refused
      ${If} $PoraCliOldRaw == ""
        StrCpy $PoraCliNextRaw $PoraCliEntry
      ${Else}
        StrCpy $PoraCliNextRaw "$PoraCliOldRaw;$PoraCliEntry"
      ${EndIf}
      StrCpy $PoraCliState "prepared"
      Call ${PORACODE_CLI_PREFIX}PoraCliBuildRecord
      Call ${PORACODE_CLI_PREFIX}PoraCliWriteRecord
      StrCmp $PoraCliOk 1 0 refused
      Call ${PORACODE_CLI_PREFIX}PoraCliWritePath
      StrCmp $PoraCliOk 1 0 refused
    ${ElseIf} $PoraCliRecord == ""
      StrCpy $PoraCliOriginalKind $PoraCliOldKind
      StrCpy $PoraCliOriginalPresent $PoraCliOldPresent
    ${EndIf}
    ${If} $PoraCliCount == 1
      StrCpy $PoraCliNextRaw $PoraCliOldRaw
    ${EndIf}
    Call ${PORACODE_CLI_PREFIX}PoraCliReadPath
    StrCmp $PoraCliReadStatus 0 0 refused
    StrCmpS $PoraCliReadRaw $PoraCliNextRaw 0 refused
    StrCmp $PoraCliReadKind $PoraCliOldKind 0 refused
    StrCpy $PoraCliState "installed"
    Call ${PORACODE_CLI_PREFIX}PoraCliBuildRecord
    Call ${PORACODE_CLI_PREFIX}PoraCliWriteRecord
    StrCmp $PoraCliOk 1 0 refused
    StrCpy $PoraCliResult "registered"
    DetailPrint "Desktop CLI: ${PORACODE_CLI_COMMAND} registered for this account. Existing PATH entries retain precedence; open a new terminal."
  ${EndIf}
  !if "${PORACODE_CLI_ENV_KEY}" == "Environment"
    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
  !endif
  Goto done
  refused:
    DetailPrint "Desktop CLI: $PoraCliReason"
    DetailPrint "Inspect HKCU\${PORACODE_CLI_REG_KEY}; uncertain custody was retained. The desktop installation will continue."
  done:
  ${If} $PoraCliMutex != 0
    StrCpy $0 $PoraCliMutex
    System::Call 'kernel32::ReleaseMutex(p r0)'
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
  Pop $9
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro customInstall
  StrCpy $PoraCliPerUser 0
  ${If} $installMode == "CurrentUser"
    StrCpy $PoraCliPerUser 1
  ${EndIf}
  StrCpy $PoraCliAction "install"
  Call PoraCliManage
!macroend


!macro customUnInstall
  ${IfNot} ${isUpdated}
    StrCpy $PoraCliPerUser 0
    ${If} $installMode == "CurrentUser"
      StrCpy $PoraCliPerUser 1
    ${EndIf}
    StrCpy $PoraCliAction "remove"
    Call un.PoraCliManage
  ${EndIf}
!macroend
