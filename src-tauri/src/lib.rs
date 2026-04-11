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
}
#[derive(Debug, Serialize, Clone, Deserialize)]
struct SerialConfig {
    port: String,
    byte_bit: u8,
    stop_bit: u8,
    check_bit: CheckBit,
    baud: u32,
    dtr_enable: bool,
    rts_enable: bool,
    open_status: bool,
    hex_show: bool,
    clean_output: bool,
}
#[derive(Debug, Serialize, Clone, Deserialize)]
struct StatusState {
    serial_open_status: bool,
    output_string: String,
    receive_count: u64,
    send_count: u64,
}
#[derive(Debug, Clone)]
struct MsgSenderState {
    sender: Arc<Sender<Vec<u8>>>,
}
#[derive(Debug, Clone)]
struct ConfigSenderState {
    sender: Arc<Sender<SerialConfig>>,
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let output_state = Mutex::new(StatusState {
        serial_open_status: false,
        output_string: String::new(),
        receive_count: 0,
        send_count: 0,
    });

    let output_state = Arc::new(output_state);

    let init_config = SerialConfig {
        port: String::from("/dev/ttyUSB0"),
        byte_bit: 8,
        stop_bit: 1,
        check_bit: CheckBit::None,
        baud: 9600,
        dtr_enable: false,
        rts_enable: false,
        open_status: false,
        hex_show: false,
        clean_output: false,
    };
    let (config_sender, config_receiver) = mpsc::channel::<SerialConfig>(1);
    let config_sender = Arc::new(config_sender);
    let config_state = ConfigSenderState {
        sender: config_sender,
    };

    let (msg_sender, msg_receiver) = mpsc::channel::<Vec<u8>>(10);
    let msg_sender = Arc::new(msg_sender);
    let msg_state = MsgSenderState { sender: msg_sender };

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.spawn(serial_thread(init_config, msg_receiver, config_receiver));

    tauri::Builder::default()
        .manage(output_state)
        .manage(config_state)
        .manage(msg_state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_serial,
            update_config,
            clean_output,
            send_msg
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
    devices.sort_by(|a, b| a.name.cmp(&b.name));
    devices
}

async fn serial_thread(
    init_config: SerialConfig,
    mut msg_receiver: Receiver<Vec<u8>>,
    mut config_receiver: Receiver<SerialConfig>,
) {
    let mut current_config = init_config;
    let mut output_string = String::new();
    loop {
        let serial_port = tokio_serial::new(current_config.port.clone(), 9600)
            .data_bits(tokio_serial::DataBits::from(
                match current_config.byte_bit {
                    5 => tokio_serial::DataBits::Five,
                    6 => tokio_serial::DataBits::Six,
                    7 => tokio_serial::DataBits::Seven,
                    8 => tokio_serial::DataBits::Eight,
                    _ => {
                        #[cfg(debug_assertions)]
                        println!(
                            "Invalid byte_bit: {}. Defaulting to 8 data bits.",
                            current_config.byte_bit
                        );
                        tokio_serial::DataBits::Eight
                    }
                },
            ))
            .stop_bits(tokio_serial::StopBits::from(match current_config.stop_bit {
                1 => tokio_serial::StopBits::One,
                2 => tokio_serial::StopBits::Two,
                _ => {
                    #[cfg(debug_assertions)]
                    println!(
                        "Invalid stop_bit: {}. Defaulting to 1 stop bit.",
                        current_config.stop_bit
                    );
                    tokio_serial::StopBits::One
                }
            }))
            .parity(match current_config.check_bit {
                CheckBit::Odd => tokio_serial::Parity::Odd,
                CheckBit::Even => tokio_serial::Parity::Even,
                CheckBit::None => tokio_serial::Parity::None,
            });

        let data = msg_receiver.try_recv();
        let config_update = config_receiver.try_recv();
        match config_update {
            Ok(new_config) => {
                #[cfg(debug_assertions)]
                println!("Received new config: {new_config:#?}");
                if current_config.clean_output {
                    output_string.clear();
                }
                if current_config.open_status != new_config.open_status {}
                if current_config.baud != new_config.baud {}
                if current_config.byte_bit != new_config.byte_bit {}
                current_config.hex_show = new_config.hex_show;
            }
            Err(mpsc::error::TryRecvError::Empty) => {}
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                println!("Config sender has been disconnected. Exiting serial thread.");
                break;
            }
        }

        match data {
            Ok(msg) => {
                #[cfg(debug_assertions)]
                println!("Received message in serial thread: {msg:#?}");
            }
            Err(mpsc::error::TryRecvError::Empty) => {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            Err(mpsc::error::TryRecvError::Disconnected) => {
                #[cfg(debug_assertions)]
                println!("Sender has been disconnected. Exiting serial thread.");
                break;
            }
        }
    }
}

#[tauri::command]
async fn update_config(
    new_config: SerialConfig,
    config_state: State<'_, ConfigSenderState>,
) -> Result<(), ()> {
    match config_state.sender.send(new_config.clone()).await {
        Ok(()) => {
            #[cfg(debug_assertions)]
            println!("Config sent successfully: {new_config:#?}");
        }
        Err(_) => {
            #[cfg(debug_assertions)]
            println!("Failed to send config");
        }
    }
    Ok(())
}

#[tauri::command]
async fn clean_output(output_state: State<'_, Arc<Mutex<StatusState>>>) -> Result<(), ()> {
    let mut output_state = output_state.lock().await;
    output_state.output_string.clear();
    output_state.receive_count = 0;
    output_state.send_count = 0;
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
