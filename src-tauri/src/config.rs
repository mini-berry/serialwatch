use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
#[derive(Debug, Serialize, Clone, Deserialize, PartialEq)]
pub enum FlowControl {
    None,
    RtsCts,
    XonXoff,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SerialConfig {
    pub port: String,
    pub data_bits: u8,
    pub stop_bits: u8,
    pub parity: CheckBit,
    pub baud: u32,
    pub flow_control: FlowControl,
    pub open_status: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveConfig {}

impl PartialEq for SerialConfig {
    fn eq(&self, other: &Self) -> bool {
        self.port == other.port
            && self.data_bits == other.data_bits
            && self.stop_bits == other.stop_bits
            && self.parity == other.parity
            && self.baud == other.baud
            && self.flow_control == other.flow_control
    }
}

#[derive(Debug, Serialize, Clone, Deserialize, PartialEq)]
pub enum CheckBit {
    Odd = 1,
    Even = 2,
    None = 0,
}

impl Default for SerialConfig {
    fn default() -> Self {
        SerialConfig {
            baud: 9600,
            stop_bits: 1,
            data_bits: 8,
            parity: CheckBit::None,
            flow_control: FlowControl::None,
            port: String::new(),
            open_status: false,
        }
    }
}

impl SerialConfig {
    // 获取配置文件路径（跨平台）
    #[allow(dead_code)]
    pub fn get_config_path() -> Result<PathBuf, String> {
        let mut config_path = if cfg!(target_os = "windows") {
            // Windows: 使用 AppData/Roaming
            dirs::config_dir()
                .ok_or("Failed to get config directory")?
                .join("serialwatch_rs")
        } else {
            // Linux/macOS: 使用 ~/.config
            dirs::config_dir()
                .ok_or("Failed to get config directory")?
                .join("serialwatch_rs")
        };

        // 确保配置目录存在
        if !config_path.exists() {
            fs::create_dir_all(&config_path).map_err(|_| "Failed to create config directory")?;
        }

        config_path = config_path.join("config.toml");
        Ok(config_path)
    }

    // 加载配置文件
    #[allow(dead_code)]
    pub fn load() -> Result<Self, String> {
        let config_path = Self::get_config_path()?;

        if config_path.exists() {
            // 配置文件存在，读取并解析
            let content =
                fs::read_to_string(&config_path).map_err(|_| "Failed to read config file")?;

            let config: SerialConfig =
                toml::from_str(&content).map_err(|_| "Failed to parse config file")?;

            Ok(config)
        } else {
            // 配置文件不存在，创建默认配置
            let default_config = SerialConfig::default();
            default_config.save()?;
            Ok(default_config)
        }
    }

    // 保存配置文件
    #[allow(dead_code)]
    pub fn save(&self) -> Result<(), String> {
        let config_path = Self::get_config_path()?;

        let save_config = SaveConfig {
        };
        // 序列化为 TOML 格式
        let toml_content = toml::to_string_pretty(&save_config)
            .map_err(|_| "Failed to serialize config to TOML")?;

        // 写入文件
        fs::write(&config_path, toml_content).map_err(|_| "Failed to write config file")?;

        Ok(())
    }

    // 更新配置
    #[allow(dead_code)]
    pub fn update(&mut self, config: SerialConfig) -> Result<(), String> {
        if *self != config {
            *self = config;
            let _ = self.save()?; // 保存更新后的配置
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_load_and_save() {
        // 创建一个临时配置
        let mut config = SerialConfig::default();
        config.port = "COM3".to_string();
        config.baud = 115200;
        config.parity = CheckBit::Even;

        // 保存配置
        assert!(config.save().is_ok());

        // 加载配置
        let loaded_config = SerialConfig::load().expect("Failed to load config");

        // 验证加载的配置与原始配置相同
        assert_eq!(config, loaded_config);
    }
}
