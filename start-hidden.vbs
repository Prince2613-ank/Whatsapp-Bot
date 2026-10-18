Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\kumar\.gemini\antigravity-ide\scratch\whatsapp-task-bot"
WshShell.Run "cmd /c set PATH=%PATH%;C:\Users\kumar\nodejs && node bot.js", 0, False
Set WshShell = Nothing
