# SerialWatch

一个基于 Tauri + Rust + React 的串口监视工具。

## 系统支持

- Ubuntu 22 及以上版本
- Windows 7 及以上版本

Linux需要安装libwebkit2gtk

debian
``` sh
sudo apt install libwebkit2gtk-4.1-dev
```

fedora
``` sh
sudo dnf install webkit2gtk4.1-devel
```

## 技术栈

- Tauri
- Rust
- React

## 已知限制

- 不支持 1.5 停止位（原因：tokio-serial 尚未实现该功能）

## 截图

![screenshot](./screenshot.png)
