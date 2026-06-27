@echo off
chcp 65001 >nul

echo [1/4] 正在执行 Tauri 构建...
call bun tauri build
if %errorlevel% neq 0 (
    echo [错误] Tauri 构建失败，终止脚本。
    pause
    exit /b 1
)

echo [2/4] 检查并创建目标目录...
if not exist ".\bundle" mkdir ".\bundle"

echo [3/4] 正在复制主程序...
copy /y ".\src-tauri\target\release\serialwatch.exe" ".\bundle\"
if %errorlevel% neq 0 (
    echo [错误] 复制 serialwatch.exe 失败，请检查文件是否存在。
    pause
    exit /b 1
)

echo [4/4] 正在复制 NSIS 安装包...
copy /y ".\src-tauri\target\release\bundle\nsis\*.exe" ".\bundle\"
if %errorlevel% neq 0 (
    echo [警告] 复制 NSIS 安装包失败，请检查文件是否存在。
)

echo.
echo ========================================
echo  所有文件打包完成！
echo ========================================
pause