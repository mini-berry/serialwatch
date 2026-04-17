use serde::Serialize;
use std::sync::Arc;
use tauri::async_runtime::Receiver;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::sync::mpsc::Sender;
use tokio_serial::SerialPortBuilderExt;

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

    let (data_sender, mut data_receiver) = mpsc::channel::<MsgToFrontend>(100);

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.spawn(serial_thread(data_sender, msg_receiver, config_receiver));

    tauri::Builder::default()
        .setup(|_app| {
            let app_handle = _app.handle().clone();
            use tauri::Emitter;
            std::thread::spawn(move || loop {
                match data_receiver.blocking_recv() {
                    Some(MsgToFrontend::DataUpdated(data)) => {
                        #[cfg(debug_assertions)]
                        app_handle.emit("data-updated", data).unwrap_or_else(|err| {
                            eprintln!("Failed to emit event: {err}");
                        });
                    }
                    Some(MsgToFrontend::SerialFailed(err)) => {
                        #[cfg(debug_assertions)]
                        println!("Main thread received serial error: {err}");
                        app_handle.emit("serial-failed", err).unwrap_or_else(|err| {
                            eprintln!("Failed to emit event: {err}");
                        });
                    }
                    Some(MsgToFrontend::Tips(msg)) => {
                        #[cfg(debug_assertions)]
                        println!("Main thread received a tip: {msg}");
                        app_handle.emit("tips", msg).unwrap_or_else(|err| {
                            eprintln!("Failed to emit event: {err}");
                        });
                    }
                    None => {
                        #[cfg(debug_assertions)]
                        println!(
                            "Data sender has been disconnected. Exiting data receiver thread."
                        );
                        break;
                    }
                }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn serial_thread(
    data_sender: Sender<MsgToFrontend>,
    mut msg_receiver: Receiver<Vec<u8>>,
    mut config_receiver: Receiver<config::SerialConfig>,
) {
    let mut current_config = config::SerialConfig::load().unwrap_or_else(|err| {
        eprintln!("Failed to load config: {err}. Using default config.");
        config::SerialConfig::default()
            .save()
            .unwrap_or_else(|err| {
                eprintln!("Failed to save default config: {err}");
            });
        config::SerialConfig::default()
    });

    let mut serial_port = None;

    loop {
        let config_updater = config_receiver.try_recv();
        match config_updater {
            Ok(new_config) => {
                #[cfg(debug_assertions)]
                println!("Thread received new config.");
                // 打开串口
                if new_config.open_status {
                    // 创建新的builder
                    let serial_builder = Some(
                        tokio_serial::new(new_config.port.clone(), new_config.baud)
                            .change_config(&new_config),
                    );
                    // 更新当前配置并保存
                    current_config.update(new_config).unwrap_or_else(|err| {
                        eprintln!("Failed to save config: {err}");
                    });
                    // 打开，自动drop；未打开，直接打开
                    serial_port = serial_builder.unwrap().open_native_async().ok();
                }
                // 关闭串口
                else {
                    serial_port = None;
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => {}
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                println!("Config sender has been disconnected. Exiting serial thread.");
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
                                data_sender.send(MsgToFrontend::DataUpdated(received_data.to_vec())).await.unwrap_or_else(|err| {
                                    eprintln!("Failed to send data to main thread: {err}");
                                });
                            }
                            Ok(_) => {}
                            Err(e) => {
                                eprintln!("Error reading from serial port: {}", e);
                                serial_port = None;
                                data_sender.send(MsgToFrontend::SerialFailed(format!("{e}"))).await.unwrap_or_else(|err| {
                                    eprintln!("Failed to send error to main thread: {err}");
                                });
                            }
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
                    match port.write_all(&msg).await {
                        Ok(()) => {
                            #[cfg(debug_assertions)]
                            println!("Sent message: {msg:?}");
                        }
                        Err(e) => {
                            eprintln!("Error writing to serial port: {}", e);
                            serial_port = None;
                        }
                    }
                } else {
                    #[cfg(debug_assertions)]
                    println!("Serial port is not open. Cannot send data.");
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => {}
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                println!("Sender has been disconnected. Exiting serial thread.");
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
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
        Err(e) => {
            eprintln!("Error scanning serial ports: {}", e);
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
            println!("Failed to send config");
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
            println!("Failed to send message");
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
                    println!(
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
                    println!(
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
    }
}
