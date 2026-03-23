use serde::Serialize;
use std::{iter::Product, sync::Mutex};
use tokio_serial::UsbPortInfo;

#[derive(Debug, Serialize, Clone)]
struct SerialDevice {
    name: String,
    port: String,
}
#[derive(Debug, Serialize, Clone)]
enum CheckBit {
    Odd,
    Even,
    None,
    Mark,
}
#[derive(Debug, Serialize, Clone)]
struct SerialConfig {
    byte_bit: u8,
    stop_bit: u8,
    check_bit: CheckBit,
    baud: u32,
    dtr_enable: bool,
    rts_enable: bool,
}
struct AppState {
    serial_open_status: bool,
    output_string: String,
    receive_count: u64,
    send_count: u64,
    current_serial_config: SerialConfig,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Mutex::new(AppState {
        serial_open_status: false,
        output_string: String::new(),
        receive_count: 0,
        send_count: 0,
        current_serial_config: SerialConfig {
            byte_bit: 8,
            stop_bit: 1,
            check_bit: CheckBit::None,
            baud: 9600,
            dtr_enable: false,
            rts_enable: false,
        },
    });
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_serial])
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_scan_serial() {
        let devices = scan_serial().await;
        devices.iter().for_each(|device| println!("{device:#?}"));
    }
}
