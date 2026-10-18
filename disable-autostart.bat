@echo off
powershell -Command "Remove-Item -Path (Join-Path [Environment]::GetFolderPath('Startup') 'WhatsAppBot.lnk') -ErrorAction SilentlyContinue"
echo [SUCCESS] Auto-start on boot has been disabled.
pause
