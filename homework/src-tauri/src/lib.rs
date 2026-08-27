mod backup;
mod migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Restores window position/size/maximized state on launch and saves it
        // on move/resize/close. Only these three flags: there is no fullscreen
        // toggle or second window in this application.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        // The migrations are attached to the database URL here; the plugin runs
        // any that are outstanding when the connection is first loaded. The
        // `sqlite:` prefix makes the path relative to the application data
        // directory, so the file lives beside the rest of the application state.
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:homework.db", migrations::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![backup::import_homework_database])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
