use tauri::Manager;

/// Windows sleep-state flags. `ES_CONTINUOUS` keeps the requested state until
/// it is cleared again, `ES_SYSTEM_REQUIRED` stops the machine from sleeping.
#[cfg(windows)]
const ES_CONTINUOUS: u32 = 0x8000_0000;
#[cfg(windows)]
const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
  fn SetThreadExecutionState(flags: u32) -> u32;
}

/// How much of each log file a diagnostics bundle carries (the newest bytes).
const MAX_LOG_READ_BYTES: usize = 1_500_000;

/// One log file shipped inside a diagnostics bundle.
#[derive(serde::Serialize)]
struct LogFileEntry {
  name: String,
  contents: String,
}

/// Grant the webview write access to exactly one file the user picked in the
/// native save dialog. The fs plugin scope starts empty, so nothing else on
/// disk becomes writable.
#[tauri::command]
fn allow_export_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
  use tauri_plugin_fs::FsExt;
  app
    .fs_scope()
    .allow_file(&path)
    .map_err(|error| error.to_string())
}

/// Reveal a file in Explorer (or open a folder when the path is a directory).
/// Windows is the only supported target, so this avoids a JS plugin scope.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
  #[cfg(windows)]
  {
    let mut command = std::process::Command::new("explorer");
    if std::path::Path::new(&path).is_dir() {
      command.arg(&path);
    } else {
      command.arg(format!("/select,{path}"));
    }
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
  }
  #[cfg(not(windows))]
  {
    let _ = path;
    Err("Revealing files is only implemented for Windows".into())
  }
}

/// Stop Windows from sleeping while a batch runs (the screen may still turn
/// off). Called at the start and end of every batch run.
#[tauri::command]
fn set_batch_active(active: bool) -> Result<(), String> {
  #[cfg(windows)]
  unsafe {
    let flags = if active {
      ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    } else {
      ES_CONTINUOUS
    };
    if SetThreadExecutionState(flags) == 0 {
      return Err("Could not change the sleep state".into());
    }
  }
  #[cfg(not(windows))]
  let _ = active;
  Ok(())
}

/// Write a frontend message into the same rotating log file as the Rust side,
/// so a release build's log tells the whole story.
#[tauri::command]
fn log_message(level: String, message: String) {
  match level.as_str() {
    "error" => log::error!("{message}"),
    "warn" => log::warn!("{message}"),
    "debug" => log::debug!("{message}"),
    _ => log::info!("{message}"),
  }
}

/// Absolute path of the app log folder (shown in Settings → Diagnostics).
#[tauri::command]
fn log_directory(app: tauri::AppHandle) -> Option<String> {
  app
    .path()
    .app_log_dir()
    .ok()
    .map(|path| path.display().to_string())
}

/// Read the rotating log files for a diagnostics bundle. Only text logs are
/// included and only the newest `MAX_LOG_READ_BYTES` of each.
#[tauri::command]
fn read_log_files(app: tauri::AppHandle) -> Result<Vec<LogFileEntry>, String> {
  let directory = app
    .path()
    .app_log_dir()
    .map_err(|error| error.to_string())?;
  let entries = match std::fs::read_dir(&directory) {
    Ok(entries) => entries,
    Err(_) => return Ok(Vec::new()),
  };

  let mut files = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() {
      continue;
    }
    let name = path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or_default()
      .to_string();
    if !(name.ends_with(".log") || name.ends_with(".txt")) {
      continue;
    }
    let bytes = match std::fs::read(&path) {
      Ok(bytes) => bytes,
      Err(_) => continue,
    };
    let start = bytes.len().saturating_sub(MAX_LOG_READ_BYTES);
    files.push(LogFileEntry {
      name,
      contents: String::from_utf8_lossy(&bytes[start..]).to_string(),
    });
  }
  files.sort_by(|left, right| left.name.cmp(&right.name));
  Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  // Single instance: a second launch focuses the running window instead of
  // opening a second webview over the same Dexie database. Must be the first
  // plugin registered.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(
      |app, _arguments, _working_directory| {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.unminimize();
          let _ = window.show();
          let _ = window.set_focus();
        }
      },
    ));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_fs::init())
    // Remembers size, position and maximized state between launches.
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      allow_export_path,
      reveal_path,
      set_batch_active,
      log_message,
      log_directory,
      read_log_files
    ])
    .setup(|app| {
      // Safety net for the hidden main window: if the frontend never calls
      // `window.show()` (bootstrap error), still present the app after 10 s.
      let handle = app.handle().clone();
      std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        if let Some(window) = handle.get_webview_window("main") {
          if !window.is_visible().unwrap_or(true) {
            let _ = window.show();
          }
        }
      });

      // Release builds log too (v0.7.5): a rotating, size-capped file in the
      // app log folder feeds Settings → Export diagnostics. Debug builds also
      // mirror everything to stdout for `npm run tauri dev`.
      let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
      } else {
        log::LevelFilter::Info
      };
      let mut log_plugin = tauri_plugin_log::Builder::default()
        .level(level)
        .max_file_size(2 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .target(tauri_plugin_log::Target::new(
          tauri_plugin_log::TargetKind::LogDir {
            file_name: Some("id-stack".to_string()),
          },
        ));
      if cfg!(debug_assertions) {
        log_plugin = log_plugin.target(tauri_plugin_log::Target::new(
          tauri_plugin_log::TargetKind::Stdout,
        ));
      }
      app.handle().plugin(log_plugin.build())?;

      log::info!(
        "ID Stack {} starting on {}",
        app.package_info().version,
        std::env::consts::OS
      );
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
