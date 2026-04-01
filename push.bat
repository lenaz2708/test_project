@echo off
setlocal
cd /d "%~dp0"

node build.js
if errorlevel 1 goto :error

set "MESSAGE=%~1"
if "%MESSAGE%"=="" set "MESSAGE=update content"

git add index.html build.js push.bat .gitignore "Еда"
git commit -m "%MESSAGE%"
if errorlevel 1 goto :error

git push
if errorlevel 1 goto :error

echo.
echo Готово. Изменения собраны и отправлены на GitHub.
goto :end

:error
echo.
echo Что-то пошло не так. Проверь вывод выше.

:end
pause
