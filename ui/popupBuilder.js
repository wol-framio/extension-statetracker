import { getCharacterData, getCharacterAvatar, saveAndUpdateHUD } from '../core/stateManager.js';
import { extension_settings } from '../../../../extensions.js';
import { updateHUD } from './hudRenderer.js';
import { buildStatePrompt } from '../core/llmParser.js';

export function buildPopupContentHtml(data) {
    let html = '';

    data.groups.forEach((group, gIndex) => {
        const arrowClass = group.collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
        const displayStyle = group.collapsed ? 'none' : 'block';
        const groupLabelColor = group.hidden ? 'opacity: 0.5; text-decoration: line-through;' : '';

        html += `
            <div class="group-container st-group-card" data-group-index="${gIndex}" >
                <!-- Group Header / Accordion Trigger -->
                <div class="group-header st-group-header" >
                    <div class="group-title-click st-group-title" style="${groupLabelColor}">
                        <i class="fa-solid ${arrowClass} group-arrow" style="font-size: 0.85em;"></i>
                        <strong>${group.name}</strong>
                    </div>
                    
                    <div class="st-group-actions">
                        <label style="cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 4px; white-space: nowrap;" title="Lock group from LLM updates">
                            <input type="checkbox" class="group-lock-toggle" data-group-index="${gIndex}" ${group.locked ? 'checked' : ''} style="display:none;">
                            <i class="fa-solid fa-lock" style="${group.locked ? 'color: #ffaa00;' : 'opacity: 0.3;'}"></i>
                        </label>
                        <label style="cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 4px; white-space: nowrap;" title="Include variables of this group in LLM prompt context">
                            <input type="checkbox" class="group-ctx-toggle" data-group-index="${gIndex}" ${!group.hidden ? 'checked' : ''}>
                            In Context
                        </label>
                        <button class="del-group-btn st-icon-btn danger" data-group-index="${gIndex}" ><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>

                <!-- Group Variables Content -->
                <div class="group-content" style="display: ${displayStyle}; padding: 8px 10px;">
        `;

        const vars = group.variables;
        const keys = Object.keys(vars);

        keys.forEach(key => {
            const instValue = (group.instructions && group.instructions[key]) ? group.instructions[key] : '';
            html += `
                <div class="popup_var_row st-var-row" data-key="${key}" data-group-name="${group.name}" draggable="true" >
                    <div class="st-var-header">
                        <i class="fa-solid fa-grip-vertical drag-handle" style="opacity: 0.4; cursor: grab; padding: 4px;" title="Drag to reorder"></i>
                        <div class="st-var-key-wrapper">
                            <input type="text" class="text_input var_key_input st-var-key-input" value="${key}" title="Variable Key Name" placeholder="Key name" >
                        </div>
                        <label style="cursor: pointer; display: flex; align-items: center;" title="Lock from LLM updates">
                            <input type="checkbox" class="var-lock-toggle" data-key="${key}" data-group-name="${group.name}" ${group.locks && group.locks[key] ? 'checked' : ''} style="display:none;">
                            <i class="fa-solid fa-lock" style="${group.locks && group.locks[key] ? 'color: #ffaa00;' : 'opacity: 0.3;'} font-size: 1.1em;"></i>
                        </label>
                        <i class="fa-solid fa-trash del_var_btn" style="cursor: pointer; color: #ff5555; opacity: 0.8; padding: 4px; flex-shrink: 0;" title="Delete variable"></i>
                    </div>
                    
                    <div class="st-var-body">
                        <input type="text" class="text_input var_val_input st-var-val-input" value="${vars[key]}" placeholder="Value" title="Current Value" >
                        
                        <div style="display: flex; gap: 4px; flex-shrink: 0;">
                            <select class="move_var_select" data-key="${key}" data-group-name="${group.name}" style="padding: 6px; font-size: 0.85em; background: #1f1f1f; color: white; border: 1px solid #444; border-radius: 4px; width: 45px;" title="Move to group">
                                <option value="">🔄</option>
                                ${data.groups.map(g => `<option value="${g.name}" ${g.name === group.name ? 'selected' : ''}>${g.name}</option>`).join('')}
                            </select>

                            <button class="toggle_visuals_btn st-icon-btn"  title="Visual settings"><i class="fa-solid fa-palette"></i></button>
                            <button class="save_var_btn st-icon-btn success"  title="Save changes"><i class="fa-solid fa-check"></i></button>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <input type="text" class="text_input var_inst_input st-var-inst-input" value="${instValue}" placeholder="Optional LLM rule (e.g. use 24h format, track gold)" title="Variable Instruction" >
                    </div>
                    <!-- Visual Config Panel -->
                    ${(() => {
                        const b = (group.bars && group.bars[key]) ? group.bars[key] : {};
                        return `
                        <div class="visual-config-panel" style="display: none; flex-direction: column; gap: 6px; padding: 8px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-top: 4px;">
                            <label style="font-size: 0.85em; display:flex; align-items:center; gap:4px; white-space: nowrap;"><input type="checkbox" class="vc_enabled" ${b.enabled ? 'checked' : ''}> Enable Visual Bar</label>
                            
                            <div style="display:flex; gap:6px; flex-wrap: wrap;">
                                <input type="text" class="text_input vc_label" value="${b.label || ''}" placeholder="Display Name (e.g. Estamina)" style="flex:1; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; min-width: 100px;">
                                <input type="number" class="text_input vc_max" value="${b.max || 100}" placeholder="Max" style="width: 60px; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; flex-shrink: 0;">
                            </div>
                            
                            <div style="display:flex; gap:6px; flex-wrap: wrap;">
                                <select class="vc_shape" style="flex:1; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; min-width: 100px;">
                                    <option value="square-bar" ${b.shape==='square-bar'?'selected':''}>Square Bar</option>
                                    <option value="rounded-bar" ${b.shape==='rounded-bar'?'selected':''}>Rounded Bar</option>
                                    <option value="circle" ${b.shape==='circle'?'selected':''}>Perfect Circle</option>
                                </select>
                                <select class="vc_valtype" style="flex:1; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; min-width: 100px;">
                                    <option value="numeric" ${b.valueType==='numeric'?'selected':''}>Numeric (x/100)</option>
                                    <option value="percentage" ${b.valueType==='percentage'?'selected':''}>Percentage (%)</option>
                                </select>
                            </div>
                            
                            <div style="display:flex; gap:6px; flex-wrap: wrap;">
                                <select class="vc_filldir" style="flex:1; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; min-width: 100px;">
                                    <option value="left-to-right" ${b.fillDir==='left-to-right'?'selected':''}>Left to Right (Bar)</option>
                                    <option value="bottom-to-top" ${b.fillDir==='bottom-to-top'?'selected':''}>Bottom to Top (Bar)</option>
                                </select>
                                <select class="vc_textpos" style="flex:1; padding:4px; font-size:0.85em; background: #222; border: 1px solid #555; border-radius: 4px; min-width: 100px;">
                                    <option value="above" ${b.textPos==='above'?'selected':''}>Text Above</option>
                                    <option value="below" ${b.textPos==='below'?'selected':''}>Text Below</option>
                                    <option value="inside" ${b.textPos==='inside'?'selected':''}>Text Inside</option>
                                    <option value="hidden" ${b.textPos==='hidden'?'selected':''}>Hidden Text</option>
                                </select>
                            </div>
                            
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap: wrap;">
                                <label style="font-size:0.8em;">Fill:</label>
                                <input type="color" class="vc_c_fill" value="${b.colorFill || '#00ff00'}" style="padding:0; border:none; width:24px; height:24px; background:transparent; flex-shrink: 0;">
                                <label style="font-size:0.8em; margin-left: 4px;">Bg:</label>
                                <input type="color" class="vc_c_bg" value="${b.colorBg || '#333333'}" style="padding:0; border:none; width:24px; height:24px; background:transparent; flex-shrink: 0;">
                                <label style="font-size:0.8em; margin-left: 4px;">Border:</label>
                                <input type="color" class="vc_c_border" value="${b.colorBorder || '#ffffff'}" style="padding:0; border:none; width:24px; height:24px; background:transparent; flex-shrink: 0;">
                            </div>
                        </div>
                        `;
                    })()}
                </div>
            `;
        });

        if (keys.length === 0) {
            html += `<div style="opacity: 0.5; font-style: italic; font-size: 0.9em; padding: 5px 0;">No variables in this group.</div>`;
        }

        html += `
                    <div style="padding: 4px 0; margin-top: 4px;">
                        <button class="st-text-btn inline_add_var_btn st-btn-ghost" data-group-name="${group.name}" style="width: 100%;"><i class="fa-solid fa-plus"></i> Add Variable Here</button>
                    </div>
                </div>
            </div>
        `;
    });

    return html;
}

export async function showQuickStatePopup() {
    const avatar = getCharacterAvatar();
    if (!avatar) {
        toastr.info("Please select a character first.");
        return;
    }

    const data = getCharacterData();
    const { Popup, POPUP_TYPE } = SillyTavern.getContext();

    let rootHtml = `<div class="st-main-container">`;
    rootHtml += `<h3 style="margin-top: 0; margin-bottom: 5px;">State Tracker</h3>`;

    // Tabs Header
    rootHtml += `
        <div class="st-tab-container">
            <div class="st-tab active" data-tab="tab-vars">Variables</div>
            <div class="st-tab" data-tab="tab-config" >Templates</div>
            <div class="st-tab" data-tab="tab-prompt" >Prompt</div>
        </div>
    `;

    // Tab 1: Variables
    rootHtml += `<div id="tab-vars" class="st-tab-content active" style="display: flex; overflow-y: auto; max-height: 65vh; padding-right: 5px;">`;
    rootHtml += `<p style="font-size: 0.85em; opacity: 0.8; margin-bottom: 0;">Modify tracked variables. The LLM updates these dynamically.</p>`;
    rootHtml += `<div id="popup_accordion_container" style="display: flex; flex-direction: column; gap: 4px;"></div>`;
    rootHtml += `</div>`;

    // Tab 2: Config & Templates
    rootHtml += `<div id="tab-config" class="st-tab-content" style="overflow-y: auto; max-height: 65vh; padding-right: 5px;">`;
    rootHtml += `
        <div style="display: flex; flex-direction: column; gap: 5px; border: 1px solid rgba(255,255,255,0.05); padding: 8px; border-radius: 6px;">
            <strong style="font-size: 0.9em;">Create Accordion Group</strong>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <input type="text" id="popup_new_group_name" class="text_input" placeholder="Group name (e.g. Apariencia)" style="flex: 1; padding: 6px; background: rgba(0,0,0,0.2) !important; color: #ffffff !important; border: 1px solid #555555 !important; border-radius: 4px; font-size: 0.9em; min-width: 120px;">
                <button id="popup_add_group_btn" class="st-text-btn st-btn-primary">Create</button>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(255,255,255,0.05); padding: 8px; border-radius: 6px;">
            <strong style="font-size: 0.9em;">Template Presets</strong>
            <button id="popup_save_preset_btn" class="st-text-btn st-btn-primary">Save Current Layout as Preset</button>
            <div style="display: flex; gap: 6px; margin-top: 4px; align-items: center; flex-wrap: wrap;">
                <select id="popup_load_preset_select" style="flex: 1; padding: 6px; background: #2a2a2a; color: white; border: 1px solid #555; border-radius: 4px; font-size: 0.85em; min-width: 120px;">
                    ${Object.keys(extension_settings.stateTracker.presets).map(name => `<option value="${name}">Preset: ${name}</option>`).join('')}
                </select>
                <div style="display: flex; gap: 4px;">
                    <button id="popup_load_preset_btn" class="st-text-btn st-btn-primary">Load</button>
                    <button id="popup_del_preset_btn" class="st-text-btn st-btn-danger">Del</button>
                </div>
            </div>
            <div style="display: flex; gap: 6px; margin-top: 4px; align-items: center; flex-wrap: wrap;">
                <select id="popup_clone_char_select" style="flex: 1; padding: 6px; background: #2a2a2a; color: white; border: 1px solid #555; border-radius: 4px; font-size: 0.85em; min-width: 120px;">
                    <option value="">-- Clone from Character --</option>
                    ${Object.keys(extension_settings.stateTracker.characters)
                        .filter(av => av !== avatar)
                        .map(av => {
                            const name = av.replace(/\.(png|jpg|webp)$/i, '');
                            return `<option value="${av}">${name}</option>`;
                        }).join('')}
                </select>
                <button id="popup_clone_char_btn" class="st-text-btn st-btn-primary">Clone</button>
            </div>
        </div>
    </div>`;

    // Tab 3: Prompt
    let currentCustomPrompt = extension_settings.stateTracker.customPrompt || "";
    if (!currentCustomPrompt || currentCustomPrompt.trim() === "") {
        currentCustomPrompt = `To update any variable when the scene, time, clothes, positions, money, or state changes, you MUST append a tag at the very end of your response:\n[UPDATE_STATE: key_name=value | another_key=value2]\nExample: [UPDATE_STATE: location_room=Kitchen | chronos_time=08:00 | {{char}}_position=Standing]. Update only the keys that changed. Unchanged keys preserve their values. You are allowed to update as many keys as necessary, there is no limit.`;
    }

    rootHtml += `<div id="tab-prompt" class="st-tab-content" style="overflow-y: auto; max-height: 65vh; padding-right: 5px;">`;
    rootHtml += `
        <div style="display: flex; flex-direction: column; gap: 5px;">
            <strong style="font-size: 0.9em;">System Injection Rule</strong>
            <p style="font-size: 0.8em; opacity: 0.8; margin: 0;">Instructs the LLM how to format state updates.</p>
            <textarea id="popup_custom_prompt" class="text_input" rows="5" style="padding: 8px; font-family: monospace; font-size: 0.85em; background: rgba(0,0,0,0.2); border: 1px solid #555; border-radius: 4px; resize: vertical;">${currentCustomPrompt}</textarea>
            <button id="popup_save_prompt_btn" class="st-text-btn st-btn-primary" style="align-self: flex-end;">Save Rule</button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <strong style="font-size: 0.9em;">Context Preview</strong>
                <button id="popup_refresh_preview_btn" class="st-text-btn st-btn-secondary"><i class="fa-solid fa-rotate-right"></i> Reload</button>
            </div>
            <div id="popup_prompt_preview" style="background: #111; border: 1px solid #333; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap; color: #ccc; max-height: 200px; overflow-y: auto;">
                Preview loading...
            </div>
            <div style="text-align: right; font-size: 0.8em; opacity: 0.7;">
                Tokens (approx): <span id="popup_prompt_tokens">0</span>
            </div>
        </div>
    </div>`;

    rootHtml += `</div>`;

    const popupContent = $(rootHtml);

    // Dynamic renderer function to rebuild the accordion container inside the active popup
    function refreshAccordion() {
        const container = popupContent.find('#popup_accordion_container');
        container.html(buildPopupContentHtml(data));

        // Re-inject options to group select dropdown
        const groupSelect = popupContent.find('#popup_new_var_group');
        groupSelect.empty();
        data.groups.forEach(g => {
            groupSelect.append(`<option value="${g.name}">${g.name}</option>`);
        });

        // Re-inject options to preset list
        const presetSelect = popupContent.find('#popup_load_preset_select');
        presetSelect.empty();
        Object.keys(extension_settings.stateTracker.presets).forEach(name => {
            presetSelect.append(`<option value="${name}">Preset: ${name}</option>`);
        });
    }

    // Initialize list content
    refreshAccordion();

    // Drag and Drop mechanics for reordering variables
    let draggedRow = null;

    popupContent.on('dragstart', '.popup_var_row', function(e) {
        // Ensure dragging starts from the handle
        if (!$(e.target).hasClass('popup_var_row') && !$(e.target).closest('.drag-handle').length) {
            e.preventDefault();
            return;
        }
        draggedRow = this;
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        $(this).css('opacity', '0.4');
    });

    popupContent.on('dragend', '.popup_var_row', function(e) {
        $(this).css('opacity', '1');
        draggedRow = null;
    });

    popupContent.on('dragover', '.popup_var_row', function(e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        return false;
    });

    popupContent.on('drop', '.popup_var_row', function(e) {
        e.stopPropagation();
        if (draggedRow && draggedRow !== this) {
            const targetRow = this;
            const groupName = $(this).data('group-name');
            const draggedGroupName = $(draggedRow).data('group-name');
            
            if (groupName !== draggedGroupName) return false;

            const container = $(this).parent();
            const allRows = container.find('.popup_var_row').toArray();
            const draggedIdx = allRows.indexOf(draggedRow);
            const targetIdx = allRows.indexOf(targetRow);

            if (draggedIdx < targetIdx) {
                $(targetRow).after(draggedRow);
            } else {
                $(targetRow).before(draggedRow);
            }

            const group = data.groups.find(g => g.name === groupName);
            if (group) {
                const newVars = {};
                const newInsts = {};
                const newBars = {};
                const newLocks = {};
                container.find('.popup_var_row').each(function() {
                    const k = $(this).data('key');
                    newVars[k] = group.variables[k];
                    if (group.instructions && group.instructions[k]) {
                        newInsts[k] = group.instructions[k];
                    }
                    if (group.bars && group.bars[k]) {
                        newBars[k] = group.bars[k];
                    }
                    if (group.locks && group.locks[k]) {
                        newLocks[k] = group.locks[k];
                    }
                });
                group.variables = newVars;
                group.instructions = newInsts;
                group.bars = newBars;
                group.locks = newLocks;
                saveAndUpdateHUD();
            }
        }
        return false;
    });

    // Event Handler: Toggle Accordion (Collapse/Expand)
    popupContent.on('click', '.group-title-click', function() {
        const container = $(this).closest('.group-container');
        const index = container.data('group-index');
        const group = data.groups[index];
        const content = container.find('.group-content');
        const arrow = container.find('.group-arrow');

        group.collapsed = !group.collapsed;
        saveAndUpdateHUD();

        content.slideToggle(200);
        arrow.toggleClass('fa-chevron-down fa-chevron-right');
    });

    // Event Handler: Toggle In-Context (Active state)
    popupContent.on('change', '.group-ctx-toggle', function() {
        const index = $(this).data('group-index');
        const group = data.groups[index];
        group.hidden = !$(this).prop('checked');
        saveAndUpdateHUD();
        refreshAccordion();
    });

    // Event Handler: Toggle Group Lock
    popupContent.on('change', '.group-lock-toggle', function() {
        const index = $(this).data('group-index');
        const group = data.groups[index];
        group.locked = $(this).prop('checked');
        saveAndUpdateHUD();
        refreshAccordion();
    });

    // Event Handler: Toggle Variable Lock
    popupContent.on('change', '.var-lock-toggle', function() {
        const key = $(this).data('key');
        const groupName = $(this).data('group-name');
        const group = data.groups.find(g => g.name === groupName);
        if (group) {
            if (!group.locks) group.locks = {};
            group.locks[key] = $(this).prop('checked');
            saveAndUpdateHUD();
            refreshAccordion();
        }
    });

    // Event Handler: Delete Group
    popupContent.on('click', '.del-group-btn', async function() {
        const index = $(this).data('group-index');
        const group = data.groups[index];
        const confirm = await Popup.show.confirm(`Delete group "${group.name}" and all its variables?`);
        if (confirm) {
            data.groups.splice(index, 1);
            saveAndUpdateHUD();
            refreshAccordion();
            toastr.success(`Group "${group.name}" deleted.`);
        }
    });

    // Event Handler: Toggle Visuals Panel
    popupContent.on('click', '.toggle_visuals_btn', function() {
        $(this).closest('.popup_var_row').find('.visual-config-panel').slideToggle(200);
    });

    // Event Handler: Save Variable
    popupContent.on('click', '.save_var_btn', function() {
        const row = $(this).closest('.popup_var_row');
        const oldKey = row.data('key');
        let newKey = row.find('.var_key_input').val().trim();
        const groupName = row.data('group-name');
        const val = row.find('.var_val_input').val().trim();
        const inst = row.find('.var_inst_input').val().trim();
        
        const vcEnabled = row.find('.vc_enabled').prop('checked');
        const vcLabel = row.find('.vc_label').val().trim();
        const vcMax = row.find('.vc_max').val();
        const vcShape = row.find('.vc_shape').val();
        const vcValType = row.find('.vc_valtype').val();
        const vcFillDir = row.find('.vc_filldir').val();
        const vcTextPos = row.find('.vc_textpos').val();
        const vccFill = row.find('.vc_c_fill').val();
        const vccBg = row.find('.vc_c_bg').val();
        const vccBorder = row.find('.vc_c_border').val();

        if (!newKey) newKey = oldKey; // Prevent empty keys

        const group = data.groups.find(g => g.name === groupName);
        if (group && group.variables[oldKey] !== undefined) {
            
            // Handle rename
            if (newKey !== oldKey) {
                delete group.variables[oldKey];
                
                if (group.instructions && group.instructions[oldKey]) {
                    if (!group.instructions) group.instructions = {};
                    group.instructions[newKey] = group.instructions[oldKey];
                    delete group.instructions[oldKey];
                }
                
                if (group.locks && group.locks[oldKey]) {
                    if (!group.locks) group.locks = {};
                    group.locks[newKey] = group.locks[oldKey];
                    delete group.locks[oldKey];
                }
                
                row.data('key', newKey);
                row.find('.move_var_select').attr('data-key', newKey);
                row.find('.var-lock-toggle').attr('data-key', newKey);
            }

            group.variables[newKey] = val;
            if (!group.instructions) group.instructions = {};
            if (inst) {
                group.instructions[newKey] = inst;
            } else {
                delete group.instructions[newKey];
            }
            
            if (!group.bars) group.bars = {};
            group.bars[newKey] = {
                enabled: vcEnabled,
                label: vcLabel,
                max: vcMax,
                shape: vcShape,
                valueType: vcValType,
                fillDir: vcFillDir,
                textPos: vcTextPos,
                colorFill: vccFill,
                colorBg: vccBg,
                colorBorder: vccBorder
            };
            
            saveAndUpdateHUD();
            toastr.success(`Variable "${newKey}" saved!`);
        }
    });

    // Event Handler: Move Variable
    popupContent.on('change', '.move_var_select', function() {
        const row = $(this).closest('.popup_var_row');
        const key = row.data('key');
        const oldGroupName = row.data('group-name');
        const newGroupName = $(this).val();

        if (oldGroupName === newGroupName) return;

        const oldGroup = data.groups.find(g => g.name === oldGroupName);
        const newGroup = data.groups.find(g => g.name === newGroupName);

        if (oldGroup && newGroup) {
            newGroup.variables[key] = oldGroup.variables[key];
            delete oldGroup.variables[key];
            
            if (oldGroup.instructions && oldGroup.instructions[key]) {
                if (!newGroup.instructions) newGroup.instructions = {};
                newGroup.instructions[key] = oldGroup.instructions[key];
                delete oldGroup.instructions[key];
            }
            
            if (oldGroup.locks && oldGroup.locks[key]) {
                if (!newGroup.locks) newGroup.locks = {};
                newGroup.locks[key] = oldGroup.locks[key];
                delete oldGroup.locks[key];
            }
            
            saveAndUpdateHUD();
            refreshAccordion();
            toastr.success(`Moved "${key}" to "${newGroupName}"`);
        }
    });

    // Event Handler: Delete Variable
    popupContent.on('click', '.del_var_btn', async function() {
        const row = $(this).closest('.popup_var_row');
        const key = row.data('key');
        const groupName = row.data('group-name');

        const confirm = await Popup.show.confirm(`Delete variable "${key}"?`);
        if (confirm) {
            const group = data.groups.find(g => g.name === groupName);
            if (group) {
                delete group.variables[key];
                if (group.instructions) delete group.instructions[key];
                if (group.bars) delete group.bars[key];
                if (group.locks) delete group.locks[key];
                saveAndUpdateHUD();
                refreshAccordion();
                toastr.success(`Variable "${key}" deleted.`);
            }
        }
    });

    // Event Handler: Inline Add Variable
    popupContent.on('click', '.inline_add_var_btn', async function() {
        const groupName = $(this).data('group-name');
        
        const key = await Popup.show.input("New Variable Key", "Enter key name (e.g., location, outfit):");
        if (!key) return;
        
        const formattedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
        if (!formattedKey) return;
        
        const val = await Popup.show.input("Initial Value", `Enter initial value for ${formattedKey}:`);
        
        const group = data.groups.find(g => g.name === groupName);
        if (!group) return;

        let exists = false;
        data.groups.forEach(g => {
            if (g.variables[formattedKey] !== undefined) exists = true;
        });

        if (exists) {
            toastr.error(`Variable "${formattedKey}" already exists.`);
            return;
        }

        group.variables[formattedKey] = val || '';
        saveAndUpdateHUD();
        toastr.success(`Variable "${formattedKey}" created!`);
        refreshAccordion();
    });

    // Event Handler: Add Group
    popupContent.find('#popup_add_group_btn').on('click', function() {
        const name = $('#popup_new_group_name').val().trim();

        if (!name) {
            toastr.error("Group name is required.");
            return;
        }

        if (data.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
            toastr.error(`Group "${name}" already exists.`);
            return;
        }

        data.groups.push({
            name: name,
            hidden: false,
            collapsed: false,
            variables: {}
        });

        saveAndUpdateHUD();
        toastr.success(`Group "${name}" created!`);
        $('#popup_new_group_name').val('');
        refreshAccordion();
    });

    // Event Handler: Save Current Layout as Preset
    popupContent.find('#popup_save_preset_btn').on('click', async function() {
        const presetName = await Popup.show.input("Save Preset Layout", "Enter a name for the new preset template:");
        if (!presetName) return;

        const name = presetName.trim();
        if (extension_settings.stateTracker.presets[name]) {
            const confirm = await Popup.show.confirm("Overwrite Preset", `A preset named "${name}" already exists. Overwrite?`);
            if (!confirm) return;
        }

        // Deep copy of current layout groups
        extension_settings.stateTracker.presets[name] = JSON.parse(JSON.stringify(data.groups));
        saveAndUpdateHUD();
        toastr.success(`Preset layout "${name}" successfully saved!`);
        refreshAccordion();
    });

    // Event Handler: Load Preset
    popupContent.find('#popup_load_preset_btn').on('click', async function() {
        const name = $('#popup_load_preset_select').val();
        if (!name) return;

        const confirm = await Popup.show.confirm("Load Preset Template", `This will OVERWRITE the current character variables with the layout of the preset "${name}". Proceed?`);
        if (confirm) {
            data.groups = JSON.parse(JSON.stringify(extension_settings.stateTracker.presets[name]));
            saveAndUpdateHUD();
            refreshAccordion();
            toastr.success(`Preset "${name}" loaded!`);
        }
    });

    // Event Handler: Delete Preset
    popupContent.find('#popup_del_preset_btn').on('click', async function() {
        const name = $('#popup_load_preset_select').val();
        if (!name) return;

        if (name === "Default RPG Roleplay") {
            toastr.error("Cannot delete the default system template.");
            return;
        }

        const confirm = await Popup.show.confirm("Delete Preset Template", `Are you sure you want to delete the preset layout "${name}"?`);
        if (confirm) {
            delete extension_settings.stateTracker.presets[name];
            saveAndUpdateHUD();
            refreshAccordion();
            toastr.success(`Preset "${name}" deleted.`);
        }
    });

    // Event Handler: Clone from another Character
    popupContent.find('#popup_clone_char_btn').on('click', async function() {
        const targetAvatar = $('#popup_clone_char_select').val();
        if (!targetAvatar) {
            toastr.error("Please select a character to clone from.");
            return;
        }

        const targetData = extension_settings.stateTracker.characters[targetAvatar];
        if (!targetData || !targetData.groups) {
            toastr.error("Target character does not have configured variables.");
            return;
        }

        const charLabel = targetAvatar.replace(/\.(png|jpg|webp)$/i, '');
        const confirm = await Popup.show.confirm("Clone Variables", `This will OVERWRITE all variables and groups of this card with the setup of "${charLabel}". Proceed?`);
        if (confirm) {
            data.groups = JSON.parse(JSON.stringify(targetData.groups));
            saveAndUpdateHUD();
            refreshAccordion();
            toastr.success(`Successfully cloned variables from "${charLabel}"!`);
        }
    });

    // Event Handler: Tabs Navigation
    popupContent.on('click', '.st-tab', function() {
        const target = $(this).data('tab');
        
        // Update active tab styling
        popupContent.find('.st-tab').css({'border-bottom': '2px solid transparent', 'opacity': '0.7'}).removeClass('active');
        $(this).css({'border-bottom': '2px solid #00aaff', 'opacity': '1'}).addClass('active');
        
        // Show target content
        popupContent.find('.st-tab-content').hide();
        popupContent.find(`#${target}`).css('display', 'flex');

        if (target === 'tab-prompt') {
            refreshPromptPreview();
        }
    });

    // Event Handler: Save Custom Prompt
    popupContent.find('#popup_save_prompt_btn').on('click', function() {
        const customPrompt = $('#popup_custom_prompt').val();
        extension_settings.stateTracker.customPrompt = customPrompt;
        saveAndUpdateHUD();
        toastr.success("Custom prompt saved!");
        refreshPromptPreview();
    });

    // Event Handler: Refresh Prompt Preview
    popupContent.find('#popup_refresh_preview_btn').on('click', refreshPromptPreview);

    async function refreshPromptPreview() {
        const promptText = buildStatePrompt();
        $('#popup_prompt_preview').text(promptText || "No active variables to inject.");
        
        if (promptText) {
            try {
                const { getTokenCountAsync } = SillyTavern.getContext();
                if (getTokenCountAsync) {
                    const count = await getTokenCountAsync(promptText);
                    $('#popup_prompt_tokens').text(count);
                } else {
                    $('#popup_prompt_tokens').text("~" + Math.round(promptText.length / 4));
                }
            } catch(e) {
                $('#popup_prompt_tokens').text("~" + Math.round(promptText.length / 4));
            }
        } else {
            $('#popup_prompt_tokens').text("0");
        }
    }

    const popup = new Popup(popupContent, POPUP_TYPE.TEXT, null, { okButton: "Close" });
    await popup.show();
}
