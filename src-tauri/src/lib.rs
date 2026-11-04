//! The native shell: one window that hosts the bundled UI, plus the two
//! plugins the desktop platform adapter uses (native file dialogs and file
//! access). Everything else runs in the renderer. On iOS and Android the
//! same entry point is called by the generated mobile project.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running BookReader");
}
