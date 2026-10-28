/**
 * Cua Driver 工具定义（由 cua-driver 0.37.0 的 `describe` 输出生成：描述截短，去掉 session 等由 Roy 代填的参数）。
 * 重新生成：在 _tmp/cua 下用 describe 导出 d.txt 后运行 gen-defs.py。Cua 自己校验参数，小版本差异不影响调用。
 */

export interface CuaToolDef {
  name: string
  label: string
  /** 会动用户的电脑：要电脑控制授权，并记入操作记录 */
  acts: boolean
  /** Roy 会代填 session（每个 Roy 会话一条 Cua 会话） */
  session: boolean
  description: string
  schema: Record<string, unknown>
}

export const CUA_DRIVER_PINNED_VERSION = '0.37.0'

export const CUA_TOOL_DEFS: CuaToolDef[] = [
 {
  "name": "list_windows",
  "label": "列出窗口",
  "acts": false,
  "session": true,
  "description": "List every top-level window currently known to the window manager. Each record self-contains its owning app identity so the caller never has to join back against list_apps. Use this — not list_apps — for any window-level reasoning: \"does this app have a visible window right now?\", \"which of this pid's windows is the main one?\". Per-record fields: window_id (HWND), pid + app_name, title, bounds {x, y, width, height}, layer (always 0), z_index (integer or null; higher values are closer to the front; null means stacking order is unavailable and callers must not infer one), is_on_screen, minimized. To select a frontmost candidate, take the …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "app": {
     "description": "Only windows of apps whose name contains this text (case-insensitive), or whose bundle id equals it. Prefer this or `pid` over an unfiltered call, …",
     "type": "string"
    },
    "on_screen_only": {
     "description": "When true, drop windows that aren't currently on-screen. Default false.",
     "type": "boolean"
    },
    "pid": {
     "description": "Optional pid filter. When set, only this pid's windows are returned.",
     "type": "integer"
    }
   },
   "type": "object"
  }
 },
 {
  "name": "list_apps",
  "label": "列出软件",
  "acts": false,
  "session": true,
  "description": "List Windows apps — both currently running and installed-but-not-running — with per-app state flags: - running: is a process for this app live? (pid is 0 when false) - active: is it the system-frontmost app? (implies running) - kind: `\"desktop\"` for `.exe`-backed apps (resolved from Start-Menu shortcuts) or `\"uwp\"` for packaged store apps. - launch_path: what `launch_app` would consume. * desktop: full `.exe` commandline (path + any arguments preserved from the source `.lnk`; the exe is quoted when it contains whitespace). * uwp: `shell:appsFolder\\{PackageFamilyName}!{AppId}` where `{AppId}` falls back to `App` when the package manifest does …",
  "schema": {
   "additionalProperties": false,
   "properties": {},
   "type": "object"
  }
 },
 {
  "name": "launch_app",
  "label": "后台启动软件",
  "acts": true,
  "session": true,
  "description": "Launch a Windows app hidden — the driver never brings the target to the foreground, the target's window is launched with SW_SHOWNOACTIVATE so it does not steal focus from whatever is currently frontmost. Provide either `bundle_id` / `name` / `aumid` (resolved as below) or `path` (full path to an executable). If both `name` and `path` are given, `path` wins. `urls` opens each URL in the default browser without activating it. Routing order: explicit `aumid` (or a `bundle_id` containing `!`) activates the packaged app via `IApplicationActivationManager::ActivateApplication`, returning the real packaged-process pid — required on Win11 for …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "additional_arguments": {
     "description": "Extra command-line arguments passed to the launched process (or activation arguments for packaged apps).",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "aumid": {
     "description": "Explicit AUMID for a packaged app. Cleaner alternative to overloading `bundle_id`. Takes precedence over `bundle_id` / `name` when present.",
     "type": "string"
    },
    "bundle_id": {
     "description": "App User Model ID (AUMID) for a packaged app — pattern `{PackageFamilyName}!{ApplicationId}`, e.g. `Microsoft.WindowsNotepad_8wekyb3d8bbwe!App`. …",
     "type": "string"
    },
    "launch_path": {
     "description": "Round-trip the `launch_path` returned by `list_apps`. Highest precedence — when set, this exact string is handed to ShellExecuteEx unchanged. For …",
     "type": "string"
    },
    "name": {
     "description": "App display name. Tried against the `shell:AppsFolder` index first for packaged-app lookup; on a miss, passed to ShellExecuteEx's PATH search.",
     "type": "string"
    },
    "path": {
     "description": "Full path to executable. Windows-only; takes precedence over name/bundle_id/aumid (but not over `launch_path`).",
     "type": "string"
    },
    "start_minimized": {
     "description": "When true, launch the app's window minimized to the taskbar instead of restored-but-not-activated. Use this when the agent wants to drive the app …",
     "type": "boolean"
    },
    "urls": {
     "description": "URLs to open in the default browser via ShellExecuteEx (no activation).",
     "items": {
      "type": "string"
     },
     "type": "array"
    }
   },
   "type": "object"
  }
 },
 {
  "name": "get_window_state",
  "label": "读取窗口",
  "acts": false,
  "session": true,
  "description": "Walk a running app's UIA tree and return it ONCE, as compact Markdown by default (`tree_format:\"markdown\"`). Every actionable element is tagged `[N]` (an element_index); its element_token is `<snapshot_id>:N`, where `snapshot_id` is printed in the response header and returned in structuredContent. Pass `tree_format:\"elements\"` for the structured `elements` array instead (explicit `element_token`, `frame`, `parent_index`, `value`, `actions` per row), or `\"both\"` for both (about twice the size). Size: a read is bounded by default (`max_elements` 250). When the walk stops at that budget the response says `Tree truncated at max_elements=…` and …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "include_accessibility_tree": {
     "description": "Default true — walk the UIA tree and return it (per `tree_format`) alongside the screenshot. Set false to SKIP the UIA walk entirely and return just …",
     "type": "boolean"
    },
    "include_screenshot": {
     "description": "Default true — returns a grounding screenshot alongside the tree. Set false to skip the grab and return tree only (the cheap path for re-indexing …",
     "type": "boolean"
    },
    "max_depth": {
     "description": "Cap on the UIA-tree walk depth. Nodes whose rendered indent would exceed this are omitted. Omit for the default (25). Lower for deep menu / Electron …",
     "minimum": 1,
     "type": "integer"
    },
    "max_elements": {
     "description": "Cap on the total number of UIA nodes walked. Truncates depth-first; markdown and structured elements truncate together. Default 250 (5 000 with …",
     "minimum": 1,
     "type": "integer"
    },
    "max_image_dimension": {
     "description": "Per-call long-edge limit for the returned screenshot, in pixels (aspect ratio preserved). Explicit values override configured behavior; 0 returns …",
     "minimum": 0,
     "type": "integer"
    },
    "pid": {
     "description": "Process ID from `list_apps`.",
     "type": "integer"
    },
    "query": {
     "description": "Optional case-insensitive substring. Projects both tree_markdown and structured elements to matches plus ancestors while preserving original indices. …",
     "type": "string"
    },
    "since": {
     "description": "A `snapshot_id` from an earlier get_window_state of the same window, or \"latest\" for this window's most recent read with the same …",
     "type": "string"
    },
    "timeout_ms": {
     "default": 1000,
     "description": "Wall-clock budget in milliseconds for the accessibility-tree walk (default 1000, min 100, max 120000). Bounds the WHOLE walk. When the budget runs …",
     "maximum": 120000,
     "minimum": 100,
     "type": "integer"
    },
    "tree_format": {
     "description": "Which tree representation to return. Default \"markdown\": the compact `tree_markdown` only, where a row `[N]` is addressed with element_token …",
     "enum": [
      "markdown",
      "elements",
      "both"
     ],
     "type": "string"
    },
    "window_id": {
     "description": "HWND of the target window. Must belong to `pid`. Enumerate via `list_windows` or read from `launch_app`'s `windows` array.",
     "type": "integer"
    }
   },
   "required": [
    "pid",
    "window_id"
   ],
   "type": "object"
  }
 },
 {
  "name": "zoom",
  "label": "放大查看",
  "acts": false,
  "session": true,
  "description": "Zoom into a rectangular region of a window screenshot at full (native) resolution. Use this when `get_window_state` returned a resized image and you need to read small text, identify icons, or verify UI details. Corners, not a size: x1,y1 is the top-left and x2,y2 the bottom-right (x,y,width,height is also accepted and converted). Coordinates `x1, y1, x2, y2` are in the same pixel space as the screenshot returned by `get_window_state` (i.e. the resized image if `max_image_dimension` is active). The maximum zoom region width is 500 px in scaled-image coordinates. A 20% padding is automatically added on every side of the requested region so …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "pid": {
     "description": "Optional target process ID. When omitted, the unique current snapshot for this session and HWND is used.",
     "type": "integer"
    },
    "window_id": {
     "description": "HWND of the target window.",
     "type": "integer"
    },
    "x1": {
     "description": "Left edge of the region (resized-image pixels).",
     "type": "number"
    },
    "x2": {
     "description": "Right edge of the region (resized-image pixels).",
     "type": "number"
    },
    "y1": {
     "description": "Top edge of the region (resized-image pixels).",
     "type": "number"
    },
    "y2": {
     "description": "Bottom edge of the region (resized-image pixels).",
     "type": "number"
    }
   },
   "required": [
    "window_id",
    "x1",
    "y1",
    "x2",
    "y2"
   ],
   "type": "object"
  }
 },
 {
  "name": "get_desktop_state",
  "label": "看整个屏幕",
  "acts": false,
  "session": true,
  "description": "Capture the full display in true screen pixels, full size unless `max_image_dimension` caps it. Use its PNG as the coordinate source for actions whose target is {kind:\"desktop\",display_id:\"primary\"}. Returns the true screen size. Vision-only: no UIA tree walk.",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "max_image_dimension": {
     "description": "Optional long-edge cap for the returned PNG, in pixels (aspect ratio preserved). Omitted or 0 returns the full-size capture. When the cap downsizes …",
     "minimum": 0,
     "type": "integer"
    }
   },
   "type": "object"
  }
 },
 {
  "name": "click",
  "label": "点击",
  "acts": true,
  "session": true,
  "description": "Left-click against a target pid. **Prefer `element_token` over pixel coordinates** — element_token works on backgrounded / minimized / hidden / off-desktop windows, surfaces a stable handle that survives rebuilds, and tells you what you're clicking via the cached element's role + label. Reach for `x, y` only when the target is a canvas / video / WebGL / custom-drawn surface that doesn't appear in the UIA tree. Two addressing modes: - `element_token` (from the last `get_window_state` snapshot of that window) — performs the UIA Invoke pattern on the cached element via PostMessage. No cursor move, no focus steal. Requires a prior …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "action": {
     "description": "Accessibility action for an element_token target. \"expand\" opens the element through UIA ExpandCollapsePattern, or clicks the dropdown half of an …",
     "type": "string"
    },
    "button": {
     "description": "Mouse button. Default \"left\".",
     "enum": [
      "left",
      "right",
      "middle"
     ],
     "type": "string"
    },
    "capture_id": {
     "description": "Optional ID from get_window_state or get_desktop_state. When present, x and y are admitted against that exact capture and the ID is consumed before …",
     "minLength": 1,
     "type": "string"
    },
    "count": {
     "description": "Click count — 1 (single), 2 (double), 3 (triple). Default 1.",
     "maximum": 3,
     "minimum": 1,
     "type": "integer"
    },
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "from_zoom": {
     "description": "When true, x and y are pixel coordinates in the last `zoom` image for this pid. The driver maps them back to window coords.",
     "type": "boolean"
    },
    "modifier": {
     "description": "Modifier keys held during the action: cmd, shift, option/alt, ctrl.",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "pid": {
     "description": "Target process ID for window scope. Optional with element_token (the token carries the pid). Omit with scope=desktop for screen-absolute coordinates …",
     "type": "integer"
    },
    "scope": {
     "default": "window",
     "description": "Coordinate frame (default \"window\"). Pass \"desktop\" with x,y and no pid/window_id for a screen-absolute click in get_desktop_state coordinates.",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "target": {
     "additionalProperties": true,
     "description": "Exact window (kind \"window\", with pid and window_id) or desktop (kind \"desktop\", with display_id). \"primary\" is the portable desktop target.",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "window_id": {
     "description": "HWND of the target window. Omit when element_token is supplied (the token carries it).",
     "type": "integer"
    },
    "x": {
     "description": "X in window-local screenshot pixels — same space as the PNG get_window_state returns. Must be provided together with y.",
     "type": "number"
    },
    "y": {
     "description": "Y in window-local screenshot pixels. Must be provided together with x.",
     "type": "number"
    }
   },
   "type": "object"
  }
 },
 {
  "name": "double_click",
  "label": "双击",
  "acts": true,
  "session": true,
  "description": "Double-click against a target pid. Two addressing modes: - `element_token` (from the last `get_window_state` snapshot of that window) — synthesizes a stamped pixel double-click at the element's cached on-screen center via PostMessage. (Windows has no AXOpen analogue; Swift's AXOpen-first path falls through to the same pixel recipe when the element doesn't advertise AXOpen, so the user-visible behavior matches.) - `x`, `y` (window-local screenshot pixels, top-left origin of the PNG returned by `get_window_state`) — posts two WM_LBUTTONDOWN/UP pairs in quick succession to the deepest child window at that point. Exactly one of `element_token` …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "from_zoom": {
     "description": "After a zoom call, pass true to translate zoom-image coords back to window space.",
     "type": "boolean"
    },
    "modifier": {
     "description": "Modifier keys held during the action: cmd, shift, option/alt, ctrl.",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "pid": {
     "description": "Target process ID. Optional with element_token (the token carries the pid).",
     "type": "integer"
    },
    "window_id": {
     "description": "HWND for the target window. Omit when element_token is supplied (the token carries it).",
     "type": "integer"
    },
    "x": {
     "description": "X in window-local screenshot pixels. Must be provided together with y.",
     "type": "number"
    },
    "y": {
     "description": "Y in window-local screenshot pixels. Must be provided together with x.",
     "type": "number"
    }
   },
   "required": [],
   "type": "object"
  }
 },
 {
  "name": "right_click",
  "label": "右键",
  "acts": true,
  "session": true,
  "description": "Right-click against a target pid. Two addressing modes: - `element_token` (from the last `get_window_state` snapshot of that window) — posts WM_RBUTTONDOWN/UP at the element's cached on-screen center via PostMessage. (Windows has no AXShowMenu analogue wired up yet; Swift's AX-action path falls through to the same pixel recipe on non-advertising elements, so user-visible behavior matches.) - `x`, `y` (window-local screenshot pixels, top-left origin of the PNG returned by `get_window_state`) — posts WM_RBUTTONDOWN/UP to the deepest child window at that point. Exactly one of `element_token` or (`x` AND `y`) must be provided. `pid` is required …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "from_zoom": {
     "description": "After a zoom call, pass true to translate zoom-image coords back to window space.",
     "type": "boolean"
    },
    "modifier": {
     "description": "Modifier keys held during the action: cmd, shift, option/alt, ctrl.",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "pid": {
     "description": "Target process ID. Optional with element_token (the token carries the pid).",
     "type": "integer"
    },
    "window_id": {
     "description": "HWND for the target window. Omit when element_token is supplied (the token carries it).",
     "type": "integer"
    },
    "x": {
     "description": "X in window-local screenshot pixels. Must be provided together with y.",
     "type": "number"
    },
    "y": {
     "description": "Y in window-local screenshot pixels. Must be provided together with x.",
     "type": "number"
    }
   },
   "required": [],
   "type": "object"
  }
 },
 {
  "name": "type_text",
  "label": "输入文字",
  "acts": true,
  "session": true,
  "description": "Insert text into the target pid via character-by-character PostMessage(WM_CHAR) to the focused window. No focus steal. Special keys (Return, Escape, arrows, Tab) go through `press_key` / `hotkey` — they are not text. **Routing on Windows.** When the target's owning EXE or top-level window class identifies it as a XAML / WinUI3 / UWP host (modern Notepad, Calculator, Photos, Settings, etc.), the tool requires `element_token` and routes through UI Automation's `ValuePattern.SetValue` — same backend as the `set_value` tool. PostMessage WM_CHAR doesn't reach those hosts (their CoreInput dispatcher only consumes events from the system input …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delay_ms": {
     "description": "Milliseconds between characters. Default 30.",
     "maximum": 200,
     "minimum": 0,
     "type": "integer"
    },
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Opaque element handle from get_window_state. When supplied, type_text writes through UIA ValuePattern and reads that exact element back by handle. …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "pid": {
     "description": "Target process ID.",
     "type": "integer"
    },
    "scope": {
     "description": "Use desktop with no pid/window_id to type into the current foreground application.",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "target": {
     "additionalProperties": true,
     "description": "Preferred per-call target: an exact window (`kind=\"window\"`, `pid`, `window_id`) or the primary desktop (`kind=\"desktop\"`, `display_id=\"primary\"`).",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "text": {
     "description": "Text to insert at the focused element's cursor.",
     "type": "string"
    },
    "window_id": {
     "description": "HWND of the target window. Omit when element_token is supplied (the token carries it).",
     "type": "integer"
    },
    "x": {
     "description": "Window-local screenshot-pixel X of the field to type into — the element px action form. Pass x,y (no element_token) and the tool pixel-clicks there …",
     "type": "number"
    },
    "y": {
     "description": "Window-local screenshot-pixel Y of the field (see x).",
     "type": "number"
    }
   },
   "required": [
    "text"
   ],
   "type": "object"
  }
 },
 {
  "name": "set_value",
  "label": "填写控件",
  "acts": true,
  "session": true,
  "description": "Set a value on a UIA element via the ValuePattern interface. Two semantic modes (matching Swift's split): - **Standard input** (text fields, sliders, combo box edit): writes the value directly through UIA `IUIAutomationValuePattern::SetValue`. This is the canonical Windows write path, equivalent to Swift's `AXValue` write. - **ComboBox**: on a native Win32 combo box (WinForms, MFC, dialogs) selects the option whose text matches `value` and sends the app the notifications a user's choice sends (CBN_SELENDOK, CBN_SELCHANGE), without focusing the window; an editable combo gets the text typed into its edit field. A drop-down list without that …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "pid": {
     "description": "Target process ID. Optional with element_token (the token carries the pid).",
     "type": "integer"
    },
    "value": {
     "description": "New value. UIA will coerce to the element's native type.",
     "type": "string"
    },
    "window_id": {
     "description": "HWND of the window. Omit when element_token is supplied (the token carries it).",
     "type": "integer"
    }
   },
   "required": [
    "value"
   ],
   "type": "object"
  }
 },
 {
  "name": "press_key",
  "label": "按键",
  "acts": true,
  "session": true,
  "description": "Press and release a single key, delivered directly to the target pid's top-level window via PostMessage(WM_KEYDOWN/WM_KEYUP). The target does NOT need to be frontmost — no focus steal. Optional `window_id` selects a specific HWND when the pid owns more than one; without it the first visible top-level window for the pid is used. Key vocabulary: return, tab, escape, up/down/left/right, space, delete, home, end, pageup, pagedown, f1-f12, plus any letter or digit. Optional `modifiers` array takes ctrl/shift/alt/win. For true combinations (ctrl+c), `hotkey` is a cleaner surface. `element_token` focuses the cached UIA element before sending the …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "key": {
     "description": "Key name (return, tab, escape, up, down, left, right, space, delete, home, end, pageup, pagedown, f1-f12, letter, digit).",
     "type": "string"
    },
    "modifiers": {
     "description": "Optional modifier names held while the key is pressed (ctrl/shift/alt/win).",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "pid": {
     "description": "Target process ID.",
     "type": "integer"
    },
    "scope": {
     "description": "Use desktop with no pid/window_id to send the key to the current foreground application.",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "target": {
     "additionalProperties": true,
     "description": "Preferred per-call target: an exact window (`kind=\"window\"`, `pid`, `window_id`) or the primary desktop (`kind=\"desktop\"`, `display_id=\"primary\"`).",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "window_id": {
     "description": "HWND for the target window. Omit when element_token is supplied; otherwise auto-resolves the pid's first visible window.",
     "type": "integer"
    },
    "x": {
     "description": "Window-local screenshot-pixel X — the element px action form: pixel-click there to focus, then send the key. Use when the key must go to a …",
     "type": "number"
    },
    "y": {
     "description": "Window-local screenshot-pixel Y (see x).",
     "type": "number"
    }
   },
   "required": [
    "key"
   ],
   "type": "object"
  }
 },
 {
  "name": "hotkey",
  "label": "快捷键",
  "acts": true,
  "session": true,
  "description": "Press a combination of keys simultaneously — e.g. `[\"ctrl\", \"c\"]` for Copy, `[\"ctrl\", \"shift\", \"t\"]` for reopen-closed-tab. Dispatch is target-aware: - **Modern XAML / WinUI / UWP targets** route through UI Automation: the driver walks the target's accessibility subtree, finds a descendant whose AcceleratorKey matches the combo, and invokes it. No focus steal, no system-queue input. - **Legacy Win32 targets with modifiers** (Ctrl+S, Alt+Tab, etc.) route through `SendInput` against the system input queue, with a brief `SetForegroundWindow` swap so the events land on the target. This path is necessary because PostMessage(WM_KEYDOWN, …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "keys": {
     "description": "Modifier(s) and one non-modifier key, e.g. [\"ctrl\", \"c\"].",
     "items": {
      "type": "string"
     },
     "minItems": 2,
     "type": "array"
    },
    "pid": {
     "description": "Target process ID.",
     "type": "integer"
    },
    "scope": {
     "description": "Use desktop with no pid/window_id to send the hotkey to the current foreground application.",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "target": {
     "additionalProperties": true,
     "description": "Preferred per-call target: an exact window (`kind=\"window\"`, `pid`, `window_id`) or the primary desktop (`kind=\"desktop\"`, `display_id=\"primary\"`).",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "window_id": {
     "description": "Explicit HWND when the pid owns multiple windows.",
     "type": "integer"
    },
    "x": {
     "description": "Window-local screenshot-pixel X — the element px action form: pixel-click there to focus, then send the combo (so e.g. Ctrl+V pastes into that …",
     "type": "number"
    },
    "y": {
     "description": "Window-local screenshot-pixel Y (see x).",
     "type": "number"
    }
   },
   "required": [
    "keys"
   ],
   "type": "object"
  }
 },
 {
  "name": "scroll",
  "label": "滚动",
  "acts": true,
  "session": true,
  "description": "Scroll the target pid's focused region. Windows transport: WM_VSCROLL / WM_HSCROLL posted to the window — the same events the OS sends when scrollbars or trackpads scroll, so any window that handles scrollbars correctly responds to this. Swift uses synthesized keystrokes (PageDown / arrow keys) via auth-signed SLEventPostToPid; both approaches reach backgrounded windows. Mapping: `by: \"page\"` → SB_PAGEDOWN/UP/LEFT/RIGHT × amount; `by: \"line\"` → SB_LINEDOWN/UP/LEFT/RIGHT × amount. Note: `element_token` is accepted for cross-platform parity but currently no-op on Windows (UIA SetFocus not wired up yet — same caveat as `press_key`).",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "amount": {
     "description": "Number of scroll ticks. Default 3.",
     "maximum": 50,
     "minimum": 1,
     "type": "integer"
    },
    "by": {
     "description": "Scroll granularity. Default: line.",
     "enum": [
      "line",
      "page"
     ],
     "type": "string"
    },
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "direction": {
     "description": "Scroll direction.",
     "enum": [
      "up",
      "down",
      "left",
      "right"
     ],
     "type": "string"
    },
    "element_token": {
     "description": "Element handle `<snapshot_id>:<row>` from get_window_state: row `[11]` of a read whose snapshot_id is s0000002a is \"s0000002a:11\" (also in …",
     "pattern": "^s[0-9a-f]{8}:[0-9]+$",
     "type": "string"
    },
    "pid": {
     "description": "Target process ID for window scope. Optional with element_token (the token carries the pid). Omit with scope=desktop for screen-absolute coordinates …",
     "type": "integer"
    },
    "scope": {
     "default": "window",
     "description": "Use \"desktop\" with x,y and no pid/window_id for screen-absolute coordinates from get_desktop_state. Default \"window\".",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "target": {
     "additionalProperties": true,
     "description": "Preferred per-call target: an exact window (`kind=\"window\"`, `pid`, `window_id`) or the primary desktop (`kind=\"desktop\"`, `display_id=\"primary\"`).",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "window_id": {
     "description": "HWND of the target window. Omit when element_token is supplied; otherwise auto-resolves the pid's first visible window.",
     "type": "integer"
    },
    "x": {
     "description": "With pid/window_id: window-local screenshot X used to target a nested scroll surface in foreground mode. Without pid/window_id: screen-absolute X for …",
     "type": "number"
    },
    "y": {
     "description": "With pid/window_id: window-local screenshot Y used to target a nested scroll surface in foreground mode. Without pid/window_id: screen-absolute Y for …",
     "type": "number"
    }
   },
   "required": [
    "direction"
   ],
   "type": "object"
  }
 },
 {
  "name": "drag",
  "label": "拖动",
  "acts": true,
  "session": true,
  "description": "Press-drag-release gesture from (from_x, from_y) to (to_x, to_y) in window-local screenshot pixels. duration_ms (default 500) is the wall-clock budget; steps (default 20) interpolates intermediate WM_MOUSEMOVE events along the path. No focus steal. After a zoom call, pass from_zoom=true. Drags that start on a window caption / title bar or resize border (i.e. moving or resizing the window itself) cannot be delivered in the background — the OS move/resize loop needs real pointer input — so they return background_unavailable; re-issue those with delivery_mode:\"foreground\". Limits and fallbacks: `get_guide({topic:\"drag\"})`.",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "button": {
     "description": "Mouse button. Default \"left\".",
     "enum": [
      "left",
      "right",
      "middle"
     ],
     "type": "string"
    },
    "delivery_mode": {
     "description": "Input delivery mode. 'background' (default) never swaps foreground: it routes through UIA Invoke / PostMessage and the window is never raised. For …",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "duration_ms": {
     "description": "Wall-clock duration of drag path. Default: 500.",
     "maximum": 10000,
     "minimum": 0,
     "type": "integer"
    },
    "from_x": {
     "description": "Drag-start X in window-local screenshot pixels.",
     "type": "number"
    },
    "from_y": {
     "description": "Drag-start Y in window-local screenshot pixels.",
     "type": "number"
    },
    "from_zoom": {
     "description": "When true, coordinates are in the last zoom image for this pid.",
     "type": "boolean"
    },
    "modifier": {
     "description": "Modifier keys held during the action: cmd, shift, option/alt, ctrl.",
     "items": {
      "type": "string"
     },
     "type": "array"
    },
    "pid": {
     "description": "Target process ID.",
     "type": "integer"
    },
    "scope": {
     "description": "Use desktop with no pid/window_id for screen-absolute coordinates.",
     "enum": [
      "window",
      "desktop"
     ],
     "type": "string"
    },
    "steps": {
     "description": "Number of intermediate WM_MOUSEMOVE events. Default: 20.",
     "maximum": 200,
     "minimum": 1,
     "type": "integer"
    },
    "target": {
     "additionalProperties": true,
     "description": "Preferred per-call target: an exact window (`kind=\"window\"`, `pid`, `window_id`) or the primary desktop (`kind=\"desktop\"`, `display_id=\"primary\"`).",
     "properties": {
      "display_id": {
       "description": "Display id. Required when kind is desktop; use \"primary\".",
       "type": "string"
      },
      "kind": {
       "description": "window requires pid and window_id; desktop requires display_id.",
       "enum": [
        "window",
        "desktop"
       ],
       "type": "string"
      },
      "pid": {
       "description": "Process id. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      },
      "window_id": {
       "description": "Window id from list_windows. Required when kind is window.",
       "minimum": 0,
       "type": "integer"
      }
     },
     "required": [
      "kind"
     ],
     "type": "object"
    },
    "to_x": {
     "description": "Drag-end X in window-local screenshot pixels.",
     "type": "number"
    },
    "to_y": {
     "description": "Drag-end Y in window-local screenshot pixels.",
     "type": "number"
    },
    "window_id": {
     "description": "Target window handle (HWND). Optional — driver picks frontmost window of pid when omitted.",
     "type": "integer"
    }
   },
   "required": [
    "from_x",
    "from_y",
    "to_x",
    "to_y"
   ],
   "type": "object"
  }
 },
 {
  "name": "invoke_menu",
  "label": "点菜单",
  "acts": true,
  "session": true,
  "description": "Resolve an exact application-menu path one live native level at a time and invoke its final item through accessibility APIs. Missing, ambiguous, disabled, or structurally mismatched segments fail closed; this tool never falls back to pixels. Menu paths and refusals: `get_guide({topic:\"menus\"})`.",
  "schema": {
   "additionalProperties": false,
   "description": "Exact, immediate-child application menu path to resolve and invoke through the operating system's accessibility API. Path labels are matched after …",
   "properties": {
    "path": {
     "description": "Menu labels from the top-level menu to the item, e.g. `[\"File\", \"Save As...\"]` (1 to 16 labels).",
     "items": {
      "maxLength": 200,
      "minLength": 1,
      "type": "string"
     },
     "maxItems": 16,
     "minItems": 1,
     "type": "array"
    },
    "pid": {
     "description": "Process ID of the application that owns the menu.",
     "minimum": 1,
     "type": "integer"
    },
    "window_id": {
     "description": "Window ID from list_windows whose menu is invoked.",
     "minimum": 1,
     "type": "integer"
    }
   },
   "required": [
    "pid",
    "window_id",
    "path"
   ],
   "type": "object"
  }
 },
 {
  "name": "run_steps",
  "label": "连续操作",
  "acts": true,
  "session": true,
  "description": "The default way to act: run one or more action tools in ONE call, in order, stop at the first failure, and (with `observe`) get what changed in the same response. Use it whenever you know the next action(s) and would otherwise re-read the window after them: fill three fields, click, and see the result in one call instead of five. Even a single step plus `observe:{}` replaces an action call followed by a get_window_state call. Each step is `{tool, args}` where `tool` is one of click, double_click, right_click, set_value, type_text, press_key, hotkey, scroll, drag, move_cursor and `args` are exactly that tool's arguments. `pid` and `window_id` …",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "app": {
     "description": "Default app (name or bundle id) for steps that name no window.",
     "type": "string"
    },
    "delay_ms": {
     "description": "Pause between steps in milliseconds (not after the last). Default 0.",
     "maximum": 2000,
     "minimum": 0,
     "type": "integer"
    },
    "delivery_mode": {
     "description": "Default delivery_mode for steps whose tool takes one and that set none.",
     "enum": [
      "background",
      "foreground"
     ],
     "type": "string"
    },
    "foreground_fallback": {
     "description": "When a step is refused because its target ignores background input (Electron, LibreOffice and other toolkits), retry it once with …",
     "type": "boolean"
    },
    "observe": {
     "description": "Optional end-of-batch observation: arguments for ONE get_window_state call. `pid` and `window_id` default to those of the last step that names both. …",
     "type": "object"
    },
    "pid": {
     "description": "Default pid for steps that name no window (a step's own pid/window_id/app/window wins).",
     "type": "integer"
    },
    "steps": {
     "description": "Ordered actions. Execution stops at the first failing step. Each step is {tool, args} or {<tool>: args}, plus optional wait_for / expect / …",
     "items": {
      "additionalProperties": true,
      "properties": {
       "args": {
        "description": "Arguments for that tool, as in a direct call, optionally with role/name/nth/app/window to name the target instead of pid/window_id/element_token.",
        "type": "object"
       },
       "expect": {
        "description": "Up to 4 checks that must hold after the action: {role?, name?, text?, gone?, value?, value_contains?, enabled?, selected?, app?, window?, …",
        "items": {
         "type": "object"
        },
        "maxItems": 4,
        "type": "array"
       },
       "timeout_ms": {
        "description": "How long a named target may take to appear. Default 3000.",
        "maximum": 10000,
        "minimum": 0,
        "type": "integer"
       },
       "tool": {
        "description": "Action tool to run.",
        "enum": [
         "click",
         "double_click",
         "right_click",
         "set_value",
         "type_text",
         "press_key",
         "hotkey",
         "scroll",
         "drag",
         "move_cursor"
        ],
        "type": "string"
       },
       "wait_for": {
        "description": "Check that must hold before the action: {role?, name?, text?, gone?, app?, window?, timeout_ms?}. Default timeout 5000 ms.",
        "type": "object"
       }
      },
      "type": "object"
     },
     "maxItems": 64,
     "minItems": 1,
     "type": "array"
    },
    "window": {
     "description": "Default window title substring for steps that name no window.",
     "type": "string"
    },
    "window_id": {
     "description": "Default window_id for steps that name no window, with `pid`.",
     "type": "integer"
    }
   },
   "required": [
    "steps"
   ],
   "type": "object"
  }
 },
 {
  "name": "verify_state",
  "label": "核对结果",
  "acts": false,
  "session": true,
  "description": "Deterministically verify bounded predicates against one exact window. The driver evaluates structured window/accessibility state and may return the final screenshot as uninterpreted visual evidence for a multimodal caller. Predicate results are satisfied, unsatisfied, or unknown; unknown never implies success. Accessibility projections are conservative: absence remains unknown unless the observed search domain is proven exhaustive.",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "expect": {
     "description": "One to eight predicates, combined with logical AND.",
     "items": {
      "additionalProperties": false,
      "properties": {
       "element": {
        "additionalProperties": false,
        "properties": {
         "enabled": {
          "type": "boolean"
         },
         "exists": {
          "description": "Assert that at least one trusted element matches the selector. Element walks are not yet exhaustive on every platform, so absence cannot be proven. …",
          "type": "boolean"
         },
         "selected": {
          "type": "boolean"
         },
         "selector": {
          "additionalProperties": false,
          "properties": {
           "label_contains": {
            "minLength": 1,
            "type": "string"
           },
           "role": {
            "minLength": 1,
            "type": "string"
           }
          },
          "required": [],
          "type": "object"
         },
         "value_equals": {
          "type": "string"
         }
        },
        "required": [
         "selector"
        ],
        "type": "object"
       },
       "window": {
        "additionalProperties": false,
        "properties": {
         "bounds": {
          "additionalProperties": false,
          "properties": {
           "height": {
            "type": "number"
           },
           "tolerance_px": {
            "maximum": 100,
            "minimum": 0,
            "type": "number"
           },
           "width": {
            "type": "number"
           },
           "x": {
            "type": "number"
           },
           "y": {
            "type": "number"
           }
          },
          "required": [
           "x",
           "y",
           "width",
           "height"
          ],
          "type": "object"
         },
         "exists": {
          "type": "boolean"
         }
        },
        "required": [],
        "type": "object"
       }
      },
      "required": [],
      "type": "object"
     },
     "maxItems": 8,
     "minItems": 1,
     "type": "array"
    },
    "include_screenshot": {
     "description": "Return the final window screenshot as image content for a multimodal caller. The driver does not interpret that image.",
     "type": "boolean"
    },
    "pid": {
     "description": "Exact process whose window may be observed.",
     "minimum": 1,
     "type": "integer"
    },
    "stable_samples": {
     "default": 2,
     "description": "Consecutive satisfied samples required before returning success.",
     "maximum": 5,
     "minimum": 1,
     "type": "integer"
    },
    "timeout_ms": {
     "default": 5000,
     "description": "Bounded wait. Zero performs one sample.",
     "maximum": 10000,
     "minimum": 0,
     "type": "integer"
    },
    "window_id": {
     "description": "Exact native window identifier.",
     "type": "integer"
    }
   },
   "required": [
    "pid",
    "window_id",
    "expect"
   ],
   "type": "object"
  }
 },
 {
  "name": "get_guide",
  "label": "查看用法",
  "acts": false,
  "session": true,
  "description": "Read Cua Driver guidance on demand, taken from the guide bundled with this driver (no skill install needed). Topics: overview, drag, browser, permissions, batching, menus. Call with no topic to list them. Read-only.",
  "schema": {
   "additionalProperties": false,
   "properties": {
    "topic": {
     "description": "One of: overview, drag, browser, permissions, batching, menus. Omit to list the topics.",
     "type": "string"
    }
   },
   "type": "object"
  }
 }
]
