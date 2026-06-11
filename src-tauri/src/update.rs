const GITHUB_API_URL: &str = "https://swrweb.netlify.app/";
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct UpdateInfo {
    version: String,
    deb: String,
    rpm: String,
    exe: String,
    setup: String,
    description: String,
}

async fn check_update() -> Option<UpdateInfo> {
    let check_url = format!("{}{}", GITHUB_API_URL, "v.json");
    let client = Client::new();

    // 发送请求并处理网络层面的错误
    let res = client.get(&check_url).send().await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                // 核心修正：使用 .json() 异步解析响应体为 UpdateInfo 结构体
                // 如果 JSON 格式不匹配或解析失败，会进入 Err 分支
                match response.json::<UpdateInfo>().await {
                    Ok(update_info) => Some(update_info),
                    Err(e) => {
                        eprintln!("Failed to parse update info: {}", e);
                        None
                    }
                }
            } else {
                eprintln!("Failed to check for updates: HTTP {}", response.status());
                None
            }
        }
        Err(e) => {
            eprintln!("Error checking for updates: {}", e);
            None
        }
    }
}

#[tauri::command]
pub async fn process_update(app_handle: tauri::AppHandle) -> bool {
    let current_version = app_handle.package_info().version.clone();
    let current_version = current_version.to_string();
    match check_update().await {
        Some(update_info) => {
            if update_info.version != current_version {
                println!(
                    "Current Ver: {}, New version: {}",
                    current_version, update_info.version
                );
                // 这里可以添加下载和安装更新的逻辑
                true
            } else {
                println!("You are using the latest version.");
                false
            }
        }
        None => {
            println!("Failed to check for updates.");
            false
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn test_check_update() {
        let update_info = check_update().await;
        println!("Update info: {:?}", update_info);
        assert!(update_info.is_some());
    }
}
