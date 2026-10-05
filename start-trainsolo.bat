@echo off
title TrainSolo - Unified Railway Assistant
cd /d "%~dp0"

echo ======================================================================
echo                     TrainSolo Railway Assistant
echo ======================================================================
echo Starting Unified Service on http://localhost:5000 ...

if not exist "trainsolo-server\dist\server.js" (
    echo Compiling TrainSolo server...
    call npm run build:server
)

if not exist "trainsolo-client\dist\index.html" (
    echo Compiling TrainSolo client...
    call npm run build:client
)

start "" http://localhost:5000
node trainsolo-server\dist\server.js
pause
