; #seam:openable-extensions
; Explorer's right-click verbs for Legion PDF, written at install time.
;
; WHY a hand-written script: electron-builder's `fileAssociations` only offers
; the plain "Open with" association. What the attorney asked for is Acrobat's
; behaviour — select a folder full of PDFs, Word declarations and scanned
; exhibits, right-click once, and get them all in one combine list. That is a
; SystemFileAssociations verb, and nothing in electron-builder writes one.
;
; WHY HKCU: the installer is per-user (`nsis.perMachine: false`, no UAC), so it
; may only write the per-user class hive. Verbs there apply to this attorney's
; own Explorer, which is the whole machine as far as he is concerned.
;
; WHY MultiSelectModel=Player: without it Explorer shows the verb only when ONE
; file is selected. "Player" is the model that keeps a verb on a multi-file
; selection; Explorer then launches one process per selected file, and
; electron/services/open-files.ts gathers those launches back into one batch.
;
; The extension list below is the SAME list as shared/convert-inputs.ts
; (`OPENABLE_EXTENSIONS`). electron/installer-verbs.test.ts parses this file and
; fails if the two ever drift apart.

!define LEGION_VERB_ROOT "Software\Classes\SystemFileAssociations"
!define LEGION_COMBINE_VERB "LegionPDF.Combine"
!define LEGION_CONVERT_VERB "LegionPDF.Convert"

; --- the file types, in one place -----------------------------------------
; Each macro applies the verb macro it is handed to every extension it covers.

; Everything that has to be converted before it can go in a PDF.
!macro LegionEachConvertible _VERB
  !insertmacro ${_VERB} ".docx"
  !insertmacro ${_VERB} ".doc"
  !insertmacro ${_VERB} ".rtf"
  !insertmacro ${_VERB} ".xlsx"
  !insertmacro ${_VERB} ".xls"
  !insertmacro ${_VERB} ".pptx"
  !insertmacro ${_VERB} ".ppt"
  !insertmacro ${_VERB} ".txt"
  !insertmacro ${_VERB} ".html"
  !insertmacro ${_VERB} ".htm"
  !insertmacro ${_VERB} ".png"
  !insertmacro ${_VERB} ".jpg"
  !insertmacro ${_VERB} ".jpeg"
  !insertmacro ${_VERB} ".tif"
  !insertmacro ${_VERB} ".tiff"
  !insertmacro ${_VERB} ".bmp"
  !insertmacro ${_VERB} ".gif"
  !insertmacro ${_VERB} ".webp"
!macroend

; Everything Legion PDF can open at all: PDFs plus all of the above.
!macro LegionEachOpenable _VERB
  !insertmacro ${_VERB} ".pdf"
  !insertmacro LegionEachConvertible ${_VERB}
!macroend

; --- the verbs -------------------------------------------------------------
; ${APP_EXECUTABLE_FILENAME} is "Legion PDF.exe" (app-builder-lib common.nsh).

!macro LegionWriteCombineVerb EXT
  !define LEGION_COMBINE_KEY "${LEGION_VERB_ROOT}\${EXT}\shell\${LEGION_COMBINE_VERB}"
  WriteRegStr HKCU "${LEGION_COMBINE_KEY}" "" "Combine in Legion PDF"
  WriteRegStr HKCU "${LEGION_COMBINE_KEY}" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "${LEGION_COMBINE_KEY}" "MultiSelectModel" "Player"
  WriteRegStr HKCU "${LEGION_COMBINE_KEY}\command" "" \
    '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --combine "%1"'
  !undef LEGION_COMBINE_KEY
!macroend

; No --combine flag: opening a non-PDF IS the conversion (the convert lane
; turns the chosen file into an unsaved PDF tab).
!macro LegionWriteConvertVerb EXT
  !define LEGION_CONVERT_KEY "${LEGION_VERB_ROOT}\${EXT}\shell\${LEGION_CONVERT_VERB}"
  WriteRegStr HKCU "${LEGION_CONVERT_KEY}" "" "Convert to PDF with Legion PDF"
  WriteRegStr HKCU "${LEGION_CONVERT_KEY}" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "${LEGION_CONVERT_KEY}" "MultiSelectModel" "Player"
  WriteRegStr HKCU "${LEGION_CONVERT_KEY}\command" "" \
    '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !undef LEGION_CONVERT_KEY
!macroend

; Uninstalling takes the verbs away and then tidies up after itself: /ifempty
; leaves any key another program still uses exactly where it is.
!macro LegionDeleteVerbs EXT
  DeleteRegKey HKCU "${LEGION_VERB_ROOT}\${EXT}\shell\${LEGION_COMBINE_VERB}"
  DeleteRegKey HKCU "${LEGION_VERB_ROOT}\${EXT}\shell\${LEGION_CONVERT_VERB}"
  DeleteRegKey /ifempty HKCU "${LEGION_VERB_ROOT}\${EXT}\shell"
  DeleteRegKey /ifempty HKCU "${LEGION_VERB_ROOT}\${EXT}"
!macroend

; --- what electron-builder calls -------------------------------------------
; SHChangeNotify(SHCNE_ASSOCCHANGED): Explorer caches the verb list, so without
; it the new menu entries only appear after a sign-out.

!macro customInstall
  !insertmacro LegionEachOpenable LegionWriteCombineVerb
  !insertmacro LegionEachConvertible LegionWriteConvertVerb
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  !insertmacro LegionEachOpenable LegionDeleteVerbs
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
