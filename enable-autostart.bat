@echo off
echo ====================================================
echo Enabling Auto-Start on Windows Boot...
echo ====================================================
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Startup'), 'WhatsAppBot.lnk')); $s.TargetPath='wscript.exe'; $s.Arguments='\"C:\Users\kumar\.gemini\antigravity-ide\scratch\whatsapp-task-bot\start-hidden.vbs\"'; $s.WorkingDirectory='C:\Users\kumar\.gemini\antigravity-ide\scratch\whatsapp-task-bot'; $s.Save()"
echo [SUCCESS] WhatsApp Bot will now automatically start in the background when Windows boots up!
pause
