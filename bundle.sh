#/bin/bash

cd ~/serialwatch/src-tauri;
cargo clean;
cd ~/serialwatch/;
git pull;
bun tauri build;
cp src-tauri/target/release/bundle/deb/*.deb ~/Desktop;
cp src-tauri/target/release/bundle/rpm/*.rpm ~/Desktop
