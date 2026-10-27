// Desktop entry point. The window itself is configured in tauri.conf.json.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bookreader_lib::run();
}
