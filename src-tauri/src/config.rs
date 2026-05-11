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
    pub dtr: bool,
    pub rts: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptConfig {
    pub recv_script: Vec<(String, String)>,
    pub send_script: Vec<(String, String)>,
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
            dtr: false,
            rts: false,
        }
    }
}

impl PartialEq for ScriptConfig {
    fn eq(&self, other: &Self) -> bool {
        self.recv_script == other.recv_script && self.send_script == other.send_script
    }
}

impl ScriptConfig {
    // 获取配置文件路径（跨平台）
    fn get_config_path() -> Result<PathBuf, String> {
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
    pub fn load() -> Result<Self, String> {
        let config_path = Self::get_config_path()?;

        if config_path.exists() {
            // 配置文件存在，读取并解析
            let content =
                fs::read_to_string(&config_path).map_err(|_| "Failed to read config file")?;

            let config: ScriptConfig =
                toml::from_str(&content).map_err(|_| "Failed to parse config file")?;

            Ok(config)
        } else {
            // 配置文件不存在，创建默认配置
            let default_config = ScriptConfig {
                recv_script: Vec::new(),
                send_script: Vec::new(),
            };
            ScriptConfig::save(default_config.clone())?;
            Ok(default_config)
        }
    }

    // 保存配置文件
    pub fn save(script: ScriptConfig) -> Result<(), String> {
        let config_path = Self::get_config_path()?;

        // 序列化为 TOML 格式
        let toml_content =
            toml::to_string_pretty(&script).map_err(|_| "Failed to serialize config to TOML")?;

        // 写入文件
        fs::write(&config_path, toml_content).map_err(|_| "Failed to write config file")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_script_config_save_and_load() {
        let test_config = ScriptConfig {
            recv_script: vec![
                ("Recv Script 1".to_string(), "recv_script_1".to_string()),
                ("Recv Script 2".to_string(), "recv_script_2".to_string()),
            ],
            send_script: vec![
                ("Send Script 1".to_string(), "send_script_1".to_string()),
                ("Send Script 2".to_string(), "send_script_2".to_string()),
            ],
        };

        // 保存配置
        ScriptConfig::save(test_config.clone()).expect("Failed to save config");

        // 加载配置
        let loaded_config = ScriptConfig::load().expect("Failed to load config");

        // 验证加载的配置与原始配置相同
        assert_eq!(test_config, loaded_config);
    }
}
