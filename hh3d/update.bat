@echo off
echo 🔄 Updating HH3D Helper Extension...

REM Kill any Chrome processes to ensure clean reload
echo Closing Chrome processes...
taskkill /f /im chrome.exe >nul 2>&1

REM Wait a moment
timeout /t 2 /nobreak >nul

echo.
echo ✅ Extension files updated!
echo.
echo 📋 Next steps:
echo 1. Open Chrome: chrome://extensions/
echo 2. Find "HH3D Helper - All-in-One Extension"
echo 3. Click "Reload" button
echo 4. Test with debug.html file
echo.
echo 🔍 Debug URLs:
echo - file:///%cd%\debug.html
echo - file:///%cd%\test.html
echo.

REM Auto-open debug page
echo Opening debug page...
start chrome "file:///%cd%/debug.html"

pause
