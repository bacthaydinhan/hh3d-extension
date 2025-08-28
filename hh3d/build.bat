@echo off
echo Building HH3D Helper Extension v2.0.0...

REM Create build directory
if not exist "build" mkdir build

REM Clean previous build
if exist "build\hh3d-helper-v2.0.0.zip" del "build\hh3d-helper-v2.0.0.zip"

REM Create zip package (requires PowerShell)
powershell -Command "Compress-Archive -Path 'manifest.json','background.js','popup.html','popup.js','popup.css','content-tele-diemdanh.js','content-vandap.js','icons','README.md' -DestinationPath 'build\hh3d-helper-v2.0.0.zip' -Force"

echo.
echo ✅ Build completed: build\hh3d-helper-v2.0.0.zip
echo.
echo 📦 Package contents:
echo   - manifest.json
echo   - background.js  
echo   - popup.html/js/css
echo   - content-tele-diemdanh.js
echo   - content-vandap.js
echo   - icons/
echo   - README.md
echo.
echo 🚀 Ready to load as unpacked extension in Chrome!
pause
