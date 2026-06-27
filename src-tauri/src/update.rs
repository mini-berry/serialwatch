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

fn compare_versions(current_version: &str, new_version: &str) -> bool {
    let current_parts: Vec<u32> = current_version
        .split('.')
        .filter_map(|s| s.parse::<u32>().ok())
        .collect();
    let new_parts: Vec<u32> = new_version
        .split('.')
        .filter_map(|s| s.parse::<u32>().ok())
        .collect();

    for (current, new) in current_parts.iter().zip(new_parts.iter()) {
        if new > current {
            return true;
        } else if new < current {
            return false;
        }
    }

    false
}
#[tauri::command]
pub async fn process_update(app_handle: tauri::AppHandle) -> bool {
    let current_version = app_handle.package_info().version.clone();
    let current_version = current_version.to_string();
    match check_update().await {
        Some(update_info) => {
            let new_version = update_info.version.clone();
            if compare_versions(&current_version, &new_version) {
                #[cfg(debug_assertions)]
                println!(
                    "New version available: {}. Current version: {}",
                    new_version, current_version
                );
                true
            } else {
                #[cfg(debug_assertions)]
                println!(
                    "No new version available. Current version: {}",
                    current_version
                );
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
