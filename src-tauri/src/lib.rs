use serde::Serialize;
use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Runtime,
  WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const MENU_BAR_LABEL: &str = "menu-bar";
const MAIN_LABEL: &str = "main";
const POPUP_W: f64 = 300.0;
const POPUP_H: f64 = 380.0;

#[derive(Clone, Serialize)]
struct TrayCommand<'a> {
  action: &'a str,
}

#[tauri::command]
fn set_tray_title<R: Runtime>(app: AppHandle<R>, text: String) -> Result<(), String> {
  let trimmed: String = if text.chars().count() > 28 {
    let head: String = text.chars().take(27).collect();
    format!(" {}…", head)
  } else if text.is_empty() {
    String::new()
  } else {
    format!(" {}", text)
  };

  if let Some(tray) = app.tray_by_id("main-tray") {
    tray
      .set_title(if trimmed.is_empty() { None } else { Some(&trimmed) })
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn set_tray_tooltip<R: Runtime>(app: AppHandle<R>, text: String) -> Result<(), String> {
  if let Some(tray) = app.tray_by_id("main-tray") {
    tray
      .set_tooltip(if text.is_empty() { None } else { Some(&text) })
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  if let Some(win) = app.get_webview_window(MAIN_LABEL) {
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
  }
  Ok(())
}

#[tauri::command]
fn hide_menu_bar_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
  if let Some(win) = app.get_webview_window(MENU_BAR_LABEL) {
    let _ = win.hide();
  }
  Ok(())
}

fn ensure_menu_bar_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  if app.get_webview_window(MENU_BAR_LABEL).is_some() {
    return Ok(());
  }

  // In dev (`tauri dev`), the Next.js dev server serves the page at `/menu-bar`
  // without an `.html` suffix. In production (static export), the page is
  // emitted as `menu-bar.html` at the output root.
  #[cfg(dev)]
  let url = WebviewUrl::App("menu-bar".into());
  #[cfg(not(dev))]
  let url = WebviewUrl::App("menu-bar.html".into());

  let mut builder =
    WebviewWindowBuilder::new(app, MENU_BAR_LABEL, url)
      .title("Mini Player")
      .inner_size(POPUP_W, POPUP_H)
      .resizable(false)
      .decorations(false)
      .transparent(true)
      .always_on_top(true)
      .skip_taskbar(true)
      .visible(false)
      .focused(false);

  #[cfg(target_os = "macos")]
  {
    use tauri::TitleBarStyle;
    builder = builder
      .title_bar_style(TitleBarStyle::Overlay)
      .hidden_title(true);
  }

  builder.build()?;
  Ok(())
}

fn position_menu_bar_window<R: Runtime>(app: &AppHandle<R>, rect: tauri::Rect) {
  let Some(win) = app.get_webview_window(MENU_BAR_LABEL) else {
    return;
  };

  let scale = win.scale_factor().unwrap_or(1.0);
  let pos_phys = rect.position.to_physical::<f64>(scale);
  let size_phys = rect.size.to_physical::<f64>(scale);

  let icon_center_x_logical = (pos_phys.x + size_phys.width / 2.0) / scale;
  let icon_bottom_y_logical = (pos_phys.y + size_phys.height) / scale;

  let target_x = icon_center_x_logical - POPUP_W / 2.0;
  let target_y = icon_bottom_y_logical + 6.0;

  let _ = win.set_position(LogicalPosition::new(target_x, target_y));
  let _ = win.set_size(LogicalSize::new(POPUP_W, POPUP_H));
}

fn toggle_menu_bar_window<R: Runtime>(app: &AppHandle<R>, rect: tauri::Rect) {
  if let Err(e) = ensure_menu_bar_window(app) {
    log::warn!("ensure menu-bar window failed: {e}");
    return;
  }

  let Some(win) = app.get_webview_window(MENU_BAR_LABEL) else {
    return;
  };

  if win.is_visible().unwrap_or(false) {
    let _ = win.hide();
  } else {
    position_menu_bar_window(app, rect);
    let _ = win.show();
    let _ = win.set_focus();
  }
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  let prev = MenuItem::with_id(app, "prev", "上一首", true, None::<&str>)?;
  let playpause = MenuItem::with_id(app, "playpause", "播放 / 暂停", true, None::<&str>)?;
  let next = MenuItem::with_id(app, "next", "下一首", true, None::<&str>)?;
  let sep1 = PredefinedMenuItem::separator(app)?;
  let show_main = MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
  let sep2 = PredefinedMenuItem::separator(app)?;
  let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

  let menu = Menu::with_items(
    app,
    &[&prev, &playpause, &next, &sep1, &show_main, &sep2, &quit],
  )?;

  let icon = app
    .default_window_icon()
    .cloned()
    .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

  TrayIconBuilder::with_id("main-tray")
    .icon(icon)
    .icon_as_template(true)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| {
      let action = match event.id().as_ref() {
        "prev" => "prev",
        "playpause" => "playpause",
        "next" => "next",
        "show-main" => {
          if let Some(win) = app.get_webview_window(MAIN_LABEL) {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
          }
          return;
        }
        "quit" => {
          app.exit(0);
          return;
        }
        _ => return,
      };
      let _ = app.emit("tray:command", TrayCommand { action });
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        rect,
        ..
      } = event
      {
        toggle_menu_bar_window(tray.app_handle(), rect);
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      set_tray_title,
      set_tray_tooltip,
      show_main_window,
      hide_menu_bar_window,
    ])
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == MAIN_LABEL {
          api.prevent_close();
          let _ = window.hide();
        } else if window.label() == MENU_BAR_LABEL {
          api.prevent_close();
          let _ = window.hide();
        }
      }
      if let WindowEvent::Focused(false) = event {
        if window.label() == MENU_BAR_LABEL {
          let _ = window.hide();
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      build_tray(app.handle())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
