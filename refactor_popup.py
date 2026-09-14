import re

with open('ui/popupBuilder.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace rootHtml tab container
content = content.replace(
    '<div style="display: flex; flex-direction: column; gap: 10px; max-height: 80vh; overflow-y: auto; text-align: left; min-width: 320px; max-width: 100%;">',
    '<div class="st-main-container">'
)
content = content.replace(
    '<div style="display: flex; border-bottom: 1px solid var(--SmartThemeBorderColor); margin-bottom: 10px;">',
    '<div class="st-tab-container">'
)
# Tabs
content = content.replace(
    'style="flex:1; text-align:center; padding: 8px; cursor: pointer; border-bottom: 2px solid #00aaff; font-weight: bold;"',
    ''
)
content = content.replace(
    'style="flex:1; text-align:center; padding: 8px; cursor: pointer; border-bottom: 2px solid transparent; opacity: 0.7;"',
    ''
)
content = content.replace(
    '<div class="st-tab active" data-tab="tab-vars" >',
    '<div class="st-tab active" data-tab="tab-vars">'
)

# Tab Contents
content = content.replace(
    'style="display: flex; flex-direction: column; gap: 8px;"',
    ''
)
content = content.replace(
    'style="display: none; flex-direction: column; gap: 8px;"',
    ''
)

# Groups
content = content.replace(
    'style="border: 1px solid var(--SmartThemeBorderColor); border-radius: 6px; margin-bottom: 8px; background: rgba(0,0,0,0.15); overflow: hidden;"',
    ''
)
content = content.replace(
    'class="group-container" data-group-index="${gIndex}"',
    'class="group-container st-group-card" data-group-index="${gIndex}"'
)
content = content.replace(
    'style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: rgba(255,255,255,0.05); cursor: pointer; user-select: none; flex-wrap: wrap; gap: 8px;"',
    ''
)
content = content.replace(
    'class="group-header"',
    'class="group-header st-group-header"'
)
content = content.replace(
    'style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 120px; ${groupLabelColor}"',
    'style="${groupLabelColor}"'
)
content = content.replace(
    'class="group-title-click"',
    'class="group-title-click st-group-title"'
)
content = content.replace(
    'style="display: flex; gap: 10px; align-items: center; cursor: default; flex-wrap: wrap;"',
    'class="st-group-actions"'
)

# Variables
content = content.replace(
    'style="display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; margin-bottom: 12px;"',
    ''
)
content = content.replace(
    'class="popup_var_row"',
    'class="popup_var_row st-var-row"'
)
content = content.replace(
    'style="display: flex; justify-content: space-between; align-items: center; gap: 8px;"',
    'class="st-var-header"'
)
content = content.replace(
    'style="flex: 1; position: relative; min-width: 100px;"',
    'class="st-var-key-wrapper"'
)
content = content.replace(
    'style="width: 100%; font-family: monospace; font-size: 0.9em; color: var(--SmartThemeQuoteColor); background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 4px 8px;"',
    ''
)
content = content.replace(
    'class="text_input var_key_input"',
    'class="text_input var_key_input st-var-key-input"'
)
content = content.replace(
    'style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;"',
    'class="st-var-body"'
)
content = content.replace(
    'style="flex: 1; padding: 6px; background: #1f1f1f !important; color: #fff !important; border: 1px solid #444 !important; border-radius: 4px; font-size: 0.95em; min-width: 100px;"',
    ''
)
content = content.replace(
    'class="text_input var_val_input"',
    'class="text_input var_val_input st-var-val-input"'
)
content = content.replace(
    'style="flex: 1; padding: 4px 8px; background: transparent !important; color: #aaa !important; border: 1px dashed #555 !important; border-radius: 4px; font-size: 0.85em; min-width: 150px;"',
    ''
)
content = content.replace(
    'class="text_input var_inst_input"',
    'class="text_input var_inst_input st-var-inst-input"'
)

# Buttons
content = content.replace(
    'style="min-width: auto; padding: 6px 10px; margin: 0; font-size: 0.9em; background: transparent; border: 1px solid rgba(255,255,255,0.2);"',
    ''
)
content = content.replace(
    'class="menu_button toggle_visuals_btn"',
    'class="toggle_visuals_btn st-icon-btn"'
)
content = content.replace(
    'style="min-width: auto; padding: 6px 12px; margin: 0; font-size: 0.9em; background: #28a745 !important; border:none; color: white;"',
    ''
)
content = content.replace(
    'class="menu_button save_var_btn"',
    'class="save_var_btn st-icon-btn success"'
)
content = content.replace(
    'style="min-width: auto; padding: 4px 8px; font-size: 0.8em; background: #900; margin: 0; white-space: nowrap; flex-shrink: 0;"',
    ''
)
content = content.replace(
    'class="menu_button del-group-btn"',
    'class="del-group-btn st-icon-btn danger"'
)

with open('ui/popupBuilder.js', 'w', encoding='utf-8') as f:
    f.write(content)
