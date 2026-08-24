mod migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // The migrations are attached to the database URL here; the plugin runs
        // any that are outstanding when the connection is first loaded. The
        // `sqlite:` prefix makes the path relative to the application data
        // directory, so the file lives beside the rest of the application state.
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:homework.db", migrations::migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
