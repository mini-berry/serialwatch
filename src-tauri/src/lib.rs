use serde::Serialize;
use std::sync::Arc;
use tauri::async_runtime::Receiver;
use tauri::Emitter;
use tauri::{Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::sync::mpsc::Sender;
use tokio_serial::ClearBuffer;
use tokio_serial::{SerialPort, SerialPortBuilderExt};

mod config;
#[allow(dead_code)]
#[derive(Debug, Serialize, Clone)]
enum MsgToFrontend {
    DataUpdated(Vec<u8>),
    SerialFailed(String),
    Tips(String),
}
#[derive(Debug, Serialize, Clone)]
struct SerialDevice {
    name: String,
    port: String,
}

#[derive(Debug, Clone)]
struct MsgSenderState {
    sender: Arc<Sender<Vec<u8>>>,
}
#[derive(Debug, Clone)]
struct ConfigSenderState {
    sender: Arc<Sender<config::SerialConfig>>,
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (config_sender, config_receiver) = mpsc::channel::<config::SerialConfig>(1);
    let config_sender = Arc::new(config_sender);
    let config_state = ConfigSenderState {
        sender: config_sender,
    };

    let (msg_sender, msg_receiver) = mpsc::channel::<Vec<u8>>(100);
    let msg_sender = Arc::new(msg_sender);
    let msg_state = MsgSenderState { sender: msg_sender };

    tauri::Builder::default()
        .setup(|_app| {
            let app_handle = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                serial_thread(msg_receiver, config_receiver, app_handle).await;
            });
            Ok(())
        })
        .manage(config_state)
        .manage(msg_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_serial,
            update_config,
            send_msg,
            open_and_activate_window,
            close_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn serial_thread(
    mut msg_receiver: Receiver<Vec<u8>>,
    mut config_receiver: Receiver<config::SerialConfig>,
    app_handle: tauri::AppHandle,
) {
    let mut serial_port: Option<tokio_serial::SerialStream> = None;

    loop {
        let config_updater = config_receiver.try_recv();
        match config_updater {
            Ok(new_config) => {
                #[cfg(debug_assertions)]
                println!("Thread received new config.");
                // 打开串口
                if new_config.open_status {
                    if let Some(port) = serial_port.take() {
                        let _ = port.clear(ClearBuffer::Output);
                        let _ = port.clear(ClearBuffer::Input);
                        drop(port);
                    }
                    // 创建新的builder
                    let serial_builder = Some(
                        tokio_serial::new(new_config.port.clone(), new_config.baud)
                            .change_config(&new_config),
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    serial_port = serial_builder.unwrap().open_native_async().ok();
                }
                // 关闭串口
                else {
                    if let Some(port) = serial_port.take() {
                        let _ = port.clear(ClearBuffer::Output);
                        let _ = port.clear(ClearBuffer::Input);
                        drop(port);
                    }
                    serial_port = None;
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => {}
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                eprintln!("Config sender has been disconnected. Exiting serial thread.");
                app_handle
                    .emit("tips", "MPSC Error, Code 01.".to_string())
                    .unwrap_or_else(|_err| {
                        #[cfg(debug_assertions)]
                        eprintln!("Failed to send tip to main thread: {_err}");
                    });
                break;
            }
        }

        match serial_port.as_mut() {
            Some(port) => {
                let mut storage = vec![0u8; 1024];
                let mut buf = tokio::io::ReadBuf::new(&mut storage);
                tokio::select! {
                    serial_result = port.read_buf(&mut buf) => {
                        match serial_result {
                            Ok(n) if n > 0 => {
                                let received_data = &storage [..n];
                                #[cfg(debug_assertions)]
                                println!("Received msg: {:?}", received_data);
                                app_handle.emit("data-updated", received_data.to_vec()).unwrap_or_else(|_err| {
                                    #[cfg(debug_assertions)]
                                    eprintln!("Failed to emit data to frontend: {_err}");
                                });
                            }
                            Err(e) => {
                                #[cfg(debug_assertions)]
                                eprintln!("Error reading from serial port: {}", e);
                                if let Some(port) = serial_port.take() {
                                    let _ = port.clear(ClearBuffer::Output);
                                    let _ = port.clear(ClearBuffer::Input);
                                    drop(port);
                                }
                                serial_port = None;
                                app_handle.emit("serial-failed", format!("{e}")).unwrap_or_else(|_err| {
                                    #[cfg(debug_assertions)]
                                    eprintln!("Failed to send error to main thread: {_err}");
                                });
                            }
                            _ => {}
                        }
                    }
                    _  =  tokio::time::sleep(std::time::Duration::from_millis(10)) => {}
                }
            }
            None => {}
        }

        let data = msg_receiver.try_recv();
        match data {
            Ok(msg) => {
                if let Some(port) = serial_port.as_mut() {
                    match tokio::time::timeout(
                        std::time::Duration::from_secs(3),
                        port.write_all(&msg),
                    )
                    .await
                    {
                        Ok(Ok(())) => {
                            #[cfg(debug_assertions)]
                            println!("Sent message: {msg:?}");
                        }
                        _ => {
                            #[cfg(debug_assertions)]
                            eprintln!("Error writing to serial port.");
                            app_handle
                                .emit(
                                    "serial-failed",
                                    "Serial Write Timeout, Code 03.".to_string(),
                                )
                                .unwrap_or_else(|_err| {
                                    #[cfg(debug_assertions)]
                                    eprintln!("Failed to send error to main thread: {_err}");
                                });
                            if let Some(port) = serial_port.take() {
                                let _ = port.clear(ClearBuffer::Output);
                                let _ = port.clear(ClearBuffer::Input);
                                drop(port);
                            }
                            serial_port = None;
                        }
                    }
                } else {
                    #[cfg(debug_assertions)]
                    eprintln!("Serial port is not open. Cannot send data.");
                    app_handle
                        .emit("serial-failed", "Serial port is not open.".to_string())
                        .unwrap_or_else(|_err| {
                            #[cfg(debug_assertions)]
                            eprintln!("Failed to send error to main thread: {_err}");
                        });
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => {}
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                eprintln!("Sender has been disconnected. Exiting serial thread.");
                app_handle
                    .emit("tips", "MPSC Write Error, Code 04.".to_string())
                    .unwrap_or_else(|_err| {
                        #[cfg(debug_assertions)]
                        eprintln!("Failed to send tip to main thread: {_err}");
                    });
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    #[cfg(debug_assertions)]
    eprintln!("Serial thread exiting.");
    app_handle
        .emit("tips", "Serial Error, Code 05.".to_string())
        .unwrap_or_else(|_err| {
            #[cfg(debug_assertions)]
            eprintln!("Failed to send tip to main thread: {_err}");
        });
}
#[tauri::command]
async fn scan_serial() -> Vec<SerialDevice> {
    #[cfg(debug_assertions)]
    println!("Scanning for serial devices...");
    let mut devices = Vec::new();

    match tokio_serial::available_ports() {
        Ok(ports) => {
            for port in ports {
                match port.port_type {
                    tokio_serial::SerialPortType::UsbPort(usb_info) => {
                        if let Some(product) = usb_info.product {
                            devices.push(SerialDevice {
                                name: product,
                                port: port.port_name,
                            });
                        } else {
                            devices.push(SerialDevice {
                                name: String::from("通信端口"),
                                port: port.port_name,
                            });
                        }
                    }
                    tokio_serial::SerialPortType::PciPort => devices.push(SerialDevice {
                        name: String::from("PCI端口"),
                        port: port.port_name,
                    }),
                    tokio_serial::SerialPortType::BluetoothPort => devices.push(SerialDevice {
                        name: String::from("蓝牙端口"),
                        port: port.port_name,
                    }),
                    _ => devices.push(SerialDevice {
                        name: String::from("未知端口"),
                        port: port.port_name,
                    }),
                }
            }
        }
        Err(_e) => {
            #[cfg(debug_assertions)]
            eprintln!("Error scanning serial ports: {_e}");
        }
    }
    devices.sort_by(|a, b| a.name.cmp(&b.name));
    devices
}

#[tauri::command]
async fn update_config(
    new_config: config::SerialConfig,
    config_state: State<'_, ConfigSenderState>,
) -> Result<(), ()> {
    match config_state.sender.send(new_config.clone()).await {
        Ok(()) => {
            #[cfg(debug_assertions)]
            println!("Config sent successfully: {new_config:?}");
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            eprintln!("Failed to send config");
        }
    }
    Ok(())
}

#[tauri::command]
async fn send_msg(msg: Vec<u8>, sender: State<'_, MsgSenderState>) -> Result<(), ()> {
    match sender.sender.send(msg.clone()).await {
        Ok(()) => {}
        Err(_) => {
            #[cfg(debug_assertions)]
            eprintln!("Failed to send message");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scan_serial() {
        let devices = scan_serial().await;
        devices.iter().for_each(|device| println!("{device:#?}"));
    }
}
trait Config {
    fn change_config(self, config: &config::SerialConfig) -> Self;
}

impl Config for tokio_serial::SerialPortBuilder {
    fn change_config(self, config: &config::SerialConfig) -> Self {
        self.path(config.port.clone())
            .baud_rate(config.baud)
            .data_bits(tokio_serial::DataBits::from(match config.data_bits {
                5 => tokio_serial::DataBits::Five,
                6 => tokio_serial::DataBits::Six,
                7 => tokio_serial::DataBits::Seven,
                8 => tokio_serial::DataBits::Eight,
                _ => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "Invalid data_bits: {}. Defaulting to 8 data bits.",
                        config.data_bits
                    );
                    tokio_serial::DataBits::Eight
                }
            }))
            .stop_bits(tokio_serial::StopBits::from(match config.stop_bits {
                1 => tokio_serial::StopBits::One,
                2 => tokio_serial::StopBits::Two,
                _ => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "Invalid stop_bits: {}. Defaulting to 1 stop bit.",
                        config.stop_bits
                    );
                    tokio_serial::StopBits::One
                }
            }))
            .parity(match config.parity {
                config::CheckBit::Odd => tokio_serial::Parity::Odd,
                config::CheckBit::Even => tokio_serial::Parity::Even,
                config::CheckBit::None => tokio_serial::Parity::None,
            })
            .flow_control(match config.flow_control {
                config::FlowControl::None => tokio_serial::FlowControl::None,
                config::FlowControl::RtsCts => tokio_serial::FlowControl::Hardware,
                config::FlowControl::XonXoff => tokio_serial::FlowControl::Software,
            })
    }
}

#[tauri::command]
async fn open_and_activate_window(
    app_handle: tauri::AppHandle,
    webview_window: tauri::WebviewWindow,
) {
    // 1. 尝试获取已存在的窗口，避免重复创建
    if let Some(window) = app_handle.get_webview_window("settings") {
        // 如果窗口存在，则激活它
        window.set_focus().unwrap();
        window.show().unwrap();
        return;
    }

    // 2. 如果窗口不存在，则创建并激活
    let _window = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("设置")
    .inner_size(400.0, 300.0)
    .resizable(false)
    .center()
    .parent(&webview_window)
    .unwrap()
    .build();
}

#[tauri::command]
async fn close_window(app_handle: tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("settings") {
        window.close().unwrap();
    }
}
