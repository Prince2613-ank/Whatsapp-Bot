@echo off
title WhatsApp Task Bot
echo ====================================================
echo Starting WhatsApp Task Bot...
echo ====================================================
set "PATH=%PATH%;C:\Users\kumar\nodejs"
cd /d "%~dp0"
node bot.js
pause
