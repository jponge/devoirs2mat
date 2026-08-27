mod backup;
mod migrations;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must be the first plugin registered (Tauri's own requirement) so it can
    // intercept a second launch before anything else starts up. A second
    // launch focuses the existing window instead of opening a second one,
    // which matters here because two processes writing to the same
    // homework.db is not a scenario this app is designed for.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    builder
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
