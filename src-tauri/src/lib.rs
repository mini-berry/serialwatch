use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::async_runtime::Receiver;
use tauri::State;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::sync::mpsc::Sender;
use tokio::sync::Mutex;
use tokio_serial::SerialPortBuilderExt;

mod config;

#[derive(Debug, Serialize, Clone)]
struct SerialDevice {
    name: String,
    port: String,
}

#[derive(Debug, Serialize, Clone, Deserialize)]
struct StatusState {
    serial_open_status: bool,
    receive_count: u64,
    send_count: u64,
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
    let output_state = Mutex::new(StatusState {
        serial_open_status: false,
        receive_count: 0,
        send_count: 0,
    });

    let output_state = Arc::new(output_state);

    let (config_sender, config_receiver) = mpsc::channel::<config::SerialConfig>(1);
    let config_sender = Arc::new(config_sender);
    let config_state = ConfigSenderState {
        sender: config_sender,
    };

    let (msg_sender, msg_receiver) = mpsc::channel::<Vec<u8>>(10);
    let msg_sender = Arc::new(msg_sender);
    let msg_state = MsgSenderState { sender: msg_sender };

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.spawn(serial_thread(
        msg_receiver,
        config_receiver,
        output_state.clone(),
    ));

    tauri::Builder::default()
        .manage(output_state)
        .manage(config_state)
        .manage(msg_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_serial,
            update_config,
            clean_count,
            send_msg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn serial_thread(
    mut msg_receiver: Receiver<Vec<u8>>,
    mut config_receiver: Receiver<config::SerialConfig>,
    output_state: Arc<Mutex<StatusState>>,
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
                let mut buf = vec![0u8; 1024];
                tokio::select! {
                    serial_result = port.read(&mut buf) => {
                        match serial_result {
                            Ok(n) if n > 0 => {
                                let received_data = &buf[..n];
                                output_state.lock().await.receive_count += received_data.len() as u64;
                                #[cfg(debug_assertions)]
                                println!("Received data: {:?}", received_data);
                            }
                            Ok(_) => {}
                            Err(e) => {
                                eprintln!("Error reading from serial port: {}", e);
                                serial_port = None;
                            }
                        }
                    }
                    _  =  tokio::time::sleep(std::time::Duration::from_millis(100)) => {}
                }
            }
            None => {}
        }

        let data = msg_receiver.try_recv();
        match data {
            Ok(msg) => {
                #[cfg(debug_assertions)]
                println!("Received message in serial thread: {msg:#?}");
                if let Some(port) = serial_port.as_mut() {
                    match port.write_all(&msg).await {
                        Ok(()) => {
                            output_state.lock().await.send_count += msg.len() as u64;
                            #[cfg(debug_assertions)]
                            println!("Sent data: {:?}", msg);
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
async fn clean_count(output_state: State<'_, Arc<Mutex<StatusState>>>) -> Result<(), ()> {
    let mut state = output_state.lock().await;
    state.receive_count = 0;
    state.send_count = 0;
    #[cfg(debug_assertions)]
    println!("Counts have been reset to zero.");
    Ok(())
}

#[tauri::command]
async fn send_msg(msg: Vec<u8>, sender: State<'_, MsgSenderState>) -> Result<(), ()> {
    match sender.sender.send(msg.clone()).await {
        Ok(()) => {
            #[cfg(debug_assertions)]
            println!("{msg:#?}")
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            println!("msg send fail")
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
