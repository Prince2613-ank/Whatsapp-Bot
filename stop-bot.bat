@echo off
echo ====================================================
echo Stopping WhatsApp Bot...
echo ====================================================
powershell -Command "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*bot.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
powershell -Command "Get-CimInstance Win32_Process -Filter \"name = 'chrome.exe'\" | Where-Object { $_.CommandLine -like '*wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo WhatsApp Bot has been stopped.
timeout /t 3
