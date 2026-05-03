@echo off
title Signet (Dev)
cd /d "F:\PROJECTS\Signet\Code"
echo Starting Signet in dev mode...
echo (Close this window to stop the dev server.)
echo.
call npm.cmd run tauri dev
echo.
echo Dev server exited.
pause
