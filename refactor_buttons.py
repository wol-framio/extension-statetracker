import re

with open('ui/popupBuilder.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace inline styles for buttons with classes
content = content.replace(
    'class="menu_button inline_add_var_btn" data-group-name="${group.name}" style="font-size: 0.85em; padding: 6px 12px; margin: 0; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; width: 100%; white-space: nowrap;"',
    'class="st-text-btn inline_add_var_btn st-btn-ghost" data-group-name="${group.name}" style="width: 100%;"'
)
content = content.replace(
    'class="menu_button" style="padding: 6px 12px; margin: 0; white-space: nowrap; flex-shrink: 0;"',
    'class="st-text-btn st-btn-primary"'
)
content = content.replace(
    'class="menu_button" style="padding: 8px; margin: 0; font-size: 0.9em; font-weight: bold; white-space: nowrap;"',
    'class="st-text-btn st-btn-primary"'
)
content = content.replace(
    'class="menu_button" style="padding: 6px 12px; margin: 0; font-size: 0.9em; font-weight: bold; white-space: nowrap; flex-shrink: 0;"',
    'class="st-text-btn st-btn-primary"'
)
content = content.replace(
    'class="menu_button" style="padding: 6px 12px; margin: 0; font-size: 0.9em; font-weight: bold; background: #900; white-space: nowrap; flex-shrink: 0;"',
    'class="st-text-btn st-btn-danger"'
)
content = content.replace(
    'class="menu_button" style="padding: 6px 12px; margin: 0; align-self: flex-end; white-space: nowrap; flex-shrink: 0;"',
    'class="st-text-btn st-btn-primary" style="align-self: flex-end;"'
)
content = content.replace(
    'class="menu_button" style="padding: 4px 10px; margin: 0; font-size: 0.85em; white-space: nowrap; flex-shrink: 0;"',
    'class="st-text-btn st-btn-secondary"'
)

with open('ui/popupBuilder.js', 'w', encoding='utf-8') as f:
    f.write(content)
