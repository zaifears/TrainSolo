@echo off
title TrainSolo - Unified Railway Assistant
cd /d "%~dp0"

echo ======================================================================
echo                     TrainSolo Railway Assistant
echo ======================================================================
echo Starting Unified Service on http://localhost:5000 ...

if "%1"=="--rebuild" goto REBUILD
if "%1"=="-r" goto REBUILD

if not exist "trainsolo-server\dist\server.js" (
    echo Compiling TrainSolo server...
    call npm run build:server
)

if not exist "trainsolo-client\dist\index.html" (
    echo Compiling TrainSolo client...
    call npm run build:client
)
goto LAUNCH

:REBUILD
echo Force recompiling TrainSolo client and server...
call npm run build

:LAUNCH
echo Launching TrainSolo at http://localhost:5000 ...
start "" /b cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:5000"
node trainsolo-server\dist\server.js
pause
