Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\kumar\.gemini\antigravity-ide\scratch\whatsapp-task-bot"
WshShell.Run "cmd /c """"C:\Users\kumar\nodejs\node.exe"""" bot.js > bot.log 2>&1", 0, False
