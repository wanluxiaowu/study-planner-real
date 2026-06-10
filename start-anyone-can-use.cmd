@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

"%PS%" -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0start-anyone-can-use.ps1"
