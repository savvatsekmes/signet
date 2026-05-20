' Hidden launcher for Signet dev mode.
' Runs `npm run tauri dev` from the Code/ directory with no visible console
' window. Tauri opens the Signet window itself when it's ready.
'
' If you ever need to see build output (errors etc.), run dev.bat directly
' from PowerShell instead.

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject") _
    .GetParentFolderName(WScript.ScriptFullName)
' 0 = hidden, False = don't wait for it to exit
sh.Run "cmd /c npm.cmd run tauri dev > dev.log 2>&1", 0, False
