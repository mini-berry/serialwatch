use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::async_runtime::Receiver;
use tauri::State;
use tokio::sync::mpsc;
use tokio::sync::mpsc::Sender;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Clone)]
struct SerialDevice {
    name: String,
    port: String,
}
#[derive(Debug, Serialize, Clone, Deserialize)]
enum CheckBit {
    Odd,
    Even,
    None,
    Mark,
}
#[derive(Debug, Serialize, Clone, Deserialize)]
struct SerialConfig {
    byte_bit: u8,
    stop_bit: u8,
    check_bit: CheckBit,
    baud: u32,
    dtr_enable: bool,
    rts_enable: bool,
}
#[derive(Debug, Serialize, Clone, Deserialize)]
struct OutputState {
    serial_open_status: bool,
    output_string: String,
    receive_count: u64,
    send_count: u64,
}
#[derive(Debug, Serialize, Clone, Deserialize)]
struct ConfigState {
    current_serial_config: SerialConfig,
    hex_show: bool,
}
#[derive(Debug, Clone)]
struct SenderState {
    sender: Arc<Sender<Vec<u8>>>,
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let output_state = Mutex::new(OutputState {
        serial_open_status: false,
        output_string: String::new(),
        receive_count: 0,
        send_count: 0,
    });

    let config_state = ConfigState {
        current_serial_config: SerialConfig {
            byte_bit: 8,
            stop_bit: 1,
            check_bit: CheckBit::None,
            baud: 9600,
            dtr_enable: false,
            rts_enable: false,
        },
        hex_show: false,
    };

    let (send_sender, send_receiver) = mpsc::channel::<Vec<u8>>(10);
    let send_sender = Arc::new(send_sender);
    let send_receiver = Arc::new(send_receiver);
    let send_state = SenderState {
        sender: send_sender,
    };

    tokio::task::spawn(serial_thread(send_receiver));

    tauri::Builder::default()
        .manage(output_state)
        .manage(config_state)
        .manage(send_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_serial,
            update_config,
            clean_output,
            get_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
    devices
}

async fn serial_thread(config_state: Arc<Receiver<Vec<u8>>>) {}

#[tauri::command]
async fn update_config(
    new_config: ConfigState,
    config_state: State<'_, Mutex<ConfigState>>,
) -> Result<(), ()> {
    let mut config_state = config_state.lock().await;
    *config_state = new_config;
    Ok(())
}

#[tauri::command]
async fn get_config(config_state: State<'_, Mutex<ConfigState>>) -> Result<ConfigState, ()> {
    let config_state = config_state.lock().await;
    return Ok(config_state.clone());
}

#[tauri::command]
async fn clean_output(output_state: State<'_, Mutex<OutputState>>) -> Result<(), ()> {
    let mut output_state = output_state.lock().await;
    output_state.output_string.clear();
    output_state.receive_count = 0;
    output_state.send_count = 0;

    Ok(())
}

#[tauri::command]
async fn send_msg(msg: Vec<u8>, sender: State<'_, SenderState>) -> Result<(), ()> {
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
