import { extension_settings } from '../../../extensions.js';
import { getCharacterData, getCharacterAvatar, saveAndUpdateHUD } from './core/stateManager.js';
import { initHUD, updateHUD } from './ui/hudRenderer.js';
import { showQuickStatePopup } from './ui/popupBuilder.js';
import { onGenerateBeforeCombinePrompts, onChatCompletionPromptReady, onMessageReceived, onMessageSent } from './core/llmParser.js';
import { initWeatherSettings, WEATHER_DICTIONARY, TEMPERATURE_PRESETS } from './core/weatherEngine.js';
import { CLOTHING_SLOTS, getCharacterProfile, initClothingState } from './core/clothingEngine.js';
import { initCalendarSettings, addEvent, removeEvent } from './core/calendarEngine.js';
import { initBiologySettings, BIOLOGY_SYSTEMS } from './core/biologyEngine.js';

if (!extension_settings.stateTracker) {
    extension_settings.stateTracker = {
        enabled: true,
        promptPosition: 1,
        promptDepth: 0,
        characters: {}, // Keyed by character avatar (legacy/fallback)
        chats: {},      // Keyed by chatId (per session)
        presets: {},    // Keyed by preset name
        customPrompt: "", // Custom LLM instructions
        enableTimeEngine: true,
        use24Hour: false,
        lang: {
            ui: 'es',
            prompt: 'en'
        }
    };
}

if (extension_settings.stateTracker.enabled === undefined) {
    extension_settings.stateTracker.enabled = true;
}

if (!extension_settings.stateTracker.chats) {
    extension_settings.stateTracker.chats = {};
}

// Ensure presets structure exists
if (!extension_settings.stateTracker.presets) {
    extension_settings.stateTracker.presets = {};
}

initWeatherSettings();
initCalendarSettings();

// Add a default template to the presets if empty
if (Object.keys(extension_settings.stateTracker.presets).length === 0) {
    extension_settings.stateTracker.presets["Default RPG Roleplay"] = [
        {
            name: "General",
            hidden: false,
            collapsed: false,
            variables: {
                "location_world": "Earth",
                "location_region": "Tokyo, Japan (Setagaya)",
                "location_room": "Bedroom",
                "chronos_weather": "Clear night"
            }
        },
        {
            name: "Apariencia y Posición",
            hidden: false,
            collapsed: false,
            variables: {
                "{{char}}_age": "29",
                "{{user}}_age": "27",
                "{{char}}_outfit": "Underwear",
                "{{user}}_outfit": "Underwear",
                "{{char}}_position": "Lying on bed",
                "{{user}}_position": "Standing near bed",
                "{{char}}_appearance": "Blushing slightly",
                "{{user}}_appearance": "Sweating"
            }
        },
        {
            name: "Inventario y Dinero",
            hidden: false,
            collapsed: false,
            variables: {
                "{{char}}_money": "100",
                "{{user}}_money": "50",
                "env_objects": "King bed, white sheets, night lamp",
                "env_characters": "No secondary characters"
            }
        }
    ];
}

const STYLE_ID = 'state-tracker-styles';
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function renderSettings() {
    const context = SillyTavern.getContext();
    const chatData = (context.chatId && extension_settings.stateTracker.chats[context.chatId]) ? extension_settings.stateTracker.chats[context.chatId] : null;
    initBiologySettings(chatData);
    if (chatData) {
        initClothingState(chatData);
    }

    $('#state_tracker_enabled').prop('checked', extension_settings.stateTracker.enabled);
    if (extension_settings.stateTracker.enableTimeEngine === undefined) {
        extension_settings.stateTracker.enableTimeEngine = true;
    }
    $('#state_tracker_time_enabled').prop('checked', extension_settings.stateTracker.enableTimeEngine);
    $('#state_tracker_24h').prop('checked', extension_settings.stateTracker.use24Hour);
    
    if (!extension_settings.stateTracker.lang) {
        extension_settings.stateTracker.lang = { ui: 'es', prompt: 'en' };
    }
    $('#st_lang_ui').val(extension_settings.stateTracker.lang.ui);
    $('#st_lang_prompt').val(extension_settings.stateTracker.lang.prompt);
    
    $('#st_prompt_pos').val(extension_settings.stateTracker.promptPosition !== undefined ? extension_settings.stateTracker.promptPosition : 1);
    $('#st_prompt_depth').val(extension_settings.stateTracker.promptDepth !== undefined ? extension_settings.stateTracker.promptDepth : 0);
    
    
    $('#st_weather_enabled').prop('checked', extension_settings.stateTracker.weather.enabled);
    $('#st_weather_temp_enabled').prop('checked', extension_settings.stateTracker.weather.temperatureEnabled);
    $('#st_weather_temp_preset').val(extension_settings.stateTracker.weather.tempPreset);
    
    for (let key in WEATHER_DICTIONARY) {
        const prob = extension_settings.stateTracker.weather.probabilities[key] || { enabled: true, weight: 10 };
        $(`#st_weather_en_${key}`).prop('checked', prob.enabled);
        $(`#st_weather_w_${key}`).val(prob.weight);
    }
    
    // Calendar settings
    $('#st_calendar_enabled').prop('checked', extension_settings.stateTracker.events.enabled);
    
    const chatContainer = $('#st_calendar_birth_container');
    if (!context.chatId) {
        chatContainer.html('<div style="font-size:0.85em; opacity:0.7;">Abre un chat para configurar fechas de nacimiento.</div>');
    } else {
        let activeChat = chatData;
        if (!activeChat) {
            activeChat = { groups: [] };
            extension_settings.stateTracker.chats[context.chatId] = activeChat;
        }
        if (!activeChat.calendar) activeChat.calendar = { enabled: true, charBirthdate: null, userBirthdate: null };
        
        const formatBday = (ts) => {
            if (!ts) return "";
            const d = new Date(ts);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        };
        
        chatContainer.html(`
            <label style="font-size: 0.85em; margin-bottom:4px; display:block;">Nacimiento Personaje ({{char}})</label>
            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
                <input type="date" id="st_cal_char_bday" class="text_input" value="${formatBday(activeChat.calendar.charBirthdate)}" style="flex: 1; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px; color-scheme: dark;">
                <input type="number" id="st_cal_char_age_calc" class="text_input" placeholder="Edad" style="width: 65px; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;" title="Calcula el año de nacimiento basado en el tiempo actual del chat">
            </div>
            
            <label style="font-size: 0.85em; margin-bottom:4px; display:block;">Nacimiento Usuario ({{user}})</label>
            <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                <input type="date" id="st_cal_user_bday" class="text_input" value="${formatBday(activeChat.calendar.userBirthdate)}" style="flex: 1; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px; color-scheme: dark;">
                <input type="number" id="st_cal_user_age_calc" class="text_input" placeholder="Edad" style="width: 65px; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;" title="Calcula el año de nacimiento basado en el tiempo actual del chat">
            </div>
        `);
    }
    
    const eventsContainer = $('#st_calendar_events_container');
    eventsContainer.empty();
    
    if (extension_settings.stateTracker.events.list.length === 0) {
        eventsContainer.html('<div style="font-size:0.85em; opacity:0.7;">No hay eventos globales.</div>');
    } else {
        extension_settings.stateTracker.events.list.forEach(e => {
            const mName = MONTHS[parseInt(e.month)];
            const dateStr = e.recurrent ? `${e.day} de ${mName} (Cada año)` : `${e.day} de ${mName}, ${e.year}`;
            eventsContainer.append(`
                <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between;">
                    <div style="flex: 1; padding-right: 10px;">
                        <div style="font-weight: bold; font-size: 0.9em; color: #ffaaee;">${e.name} <span style="font-size: 0.8em; color: #aaa; font-weight: normal;">(${dateStr})</span></div>
                        <div style="font-size: 0.8em; opacity: 0.8; margin-top: 3px;">${e.desc}</div>
                    </div>
                    <div class="st_cal_btn_del" data-id="${e.id}" style="cursor: pointer; color: #ff5555; padding: 5px;" title="Eliminar evento">
                        <i class="fa-solid fa-trash"></i>
                    </div>
                </div>
            `);
        });
    }
    
    // Biology settings
    const bioConfig = extension_settings.stateTracker.biology_config || {};
    $('#st_bio_enabled').prop('checked', bioConfig.enabled);
    
    const bioContainer = $('#st_bio_systems_container');
    bioContainer.empty();
    
    for (let key in BIOLOGY_SYSTEMS) {
        const sys = BIOLOGY_SYSTEMS[key];
        const isChecked = bioConfig[key] !== undefined ? bioConfig[key] : sys.default;
        bioContainer.append(`
            <label class="checkbox_label" style="display: flex; align-items: flex-start; cursor: pointer; margin-bottom: 8px;">
                <input type="checkbox" id="st_bio_sys_${key}" data-key="${key}" class="st_bio_sys_toggle" style="margin-right: 8px; margin-top: 3px;" ${isChecked ? 'checked' : ''}>
                <div>
                    <div style="font-weight: bold; font-size: 0.9em; color: #aaffaa;">${sys.name}</div>
                    <div style="font-size: 0.8em; opacity: 0.7;">${sys.desc}</div>
                </div>
            </label>
        `);
    }
    
    renderWardrobe();
}

function renderWardrobe() {
    $('#st_clothing_enabled').prop('checked', extension_settings.stateTracker.clothing_enabled);
    
    const context = SillyTavern.getContext();
    if (context.characterId === undefined) {
        $('#st_wardrobe_items_container').html('<div style="font-size: 0.8em; opacity: 0.6;">Selecciona un personaje en el chat para editar su armario.</div>');
        return;
    }
    
    const avatar = getCharacterAvatar();
    const profile = getCharacterProfile(avatar);
    if (!profile) return;
    
    $('#st_char_sex').val(profile.sex);
    
    const slotSelect = $('#st_wd_new_slot');
    slotSelect.empty();
    for (let key in CLOTHING_SLOTS) {
        slotSelect.append(`<option value="${key}">${CLOTHING_SLOTS[key].name_es}</option>`);
    }
    
    const itemsContainer = $('#st_wardrobe_items_container');
    itemsContainer.empty();
    
    const items = profile.wardrobe.items;
    if (Object.keys(items).length === 0) {
        itemsContainer.html('<div style="font-size: 0.8em; opacity: 0.6;">Sin prendas.</div>');
    } else {
        for (let key in items) {
            const item = items[key];
            const slotName = CLOTHING_SLOTS[item.slot]?.name_es || item.slot;
            itemsContainer.append(`
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 5px; margin-bottom: 4px; border-radius: 4px;">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="font-size: 0.85em; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</strong>
                        <span style="font-size: 0.75em; opacity: 0.7; word-break: break-all;">(${key}) - ${slotName}</span>
                    </div>
                    <div style="display: flex; gap: 12px; margin-left: 10px; align-items: center;">
                        <i class="fa-solid fa-pen st_wd_edit_item" data-id="${key}" data-name="${item.name}" style="cursor: pointer; color: #55aaff; font-size: 1.1em; padding: 4px;" title="Editar"></i>
                        <i class="fa-solid fa-trash st_wd_del_item" data-id="${key}" style="cursor: pointer; color: #ff5555; font-size: 1.1em; padding: 4px;" title="Eliminar"></i>
                    </div>
                </div>
            `);
        }
    }
    
    const outfitsContainer = $('#st_wardrobe_outfits_container');
    outfitsContainer.empty();
    
    const outfits = profile.wardrobe.outfits;
    if (Object.keys(outfits).length === 0) {
        outfitsContainer.html('<div style="font-size: 0.8em; opacity: 0.6;">Sin conjuntos.</div>');
    } else {
        for (let key in outfits) {
            const outfitItems = outfits[key].join(', ');
            outfitsContainer.append(`
                <div style="background: rgba(0,0,0,0.3); padding: 5px; margin-bottom: 4px; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 0.85em;">[OUTFIT: ${key}]</strong>
                        <i class="fa-solid fa-trash st_outfit_del" data-id="${key}" style="cursor: pointer; color: #ff5555; padding: 4px;"></i>
                    </div>
                    <div style="font-size: 0.75em; opacity: 0.7; margin-top: 3px;">Prendas: ${outfitItems}</div>
                </div>
            `);
        }
    }
}

function setupUIHandlers() {
    $('#state_tracker_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.enabled = $(this).prop('checked');
        saveAndUpdateHUD();
    });
    $('#state_tracker_time_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.enableTimeEngine = $(this).prop('checked');
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => {
            if (module.refreshAllWidgets) module.refreshAllWidgets();
        });
    });
    
    $('#st_btn_sync_turn0').off('click').on('click', function() {
        const context = SillyTavern.getContext();
        if (!context.chatId || !context.chat || context.chat.length === 0) {
            toastr.error("No hay un chat activo.", "State Tracker");
            return;
        }
        
        let targetSnapshot = null;
        for (let i = 0; i < context.chat.length; i++) {
            if (context.chat[i].extra && context.chat[i].extra.stateTrackerSnapshot) {
                targetSnapshot = context.chat[i].extra.stateTrackerSnapshot;
                break; // stop at the EARLIEST snapshot found (which corresponds to Turn 0 or 1)
            }
        }
        
        if (targetSnapshot) {
            // Ensure time exists so it can advance
            if (!targetSnapshot.time) {
                targetSnapshot.time = { minutes: 480 };
            }
            extension_settings.stateTracker.chats[context.chatId] = JSON.parse(JSON.stringify(targetSnapshot));
            
            // CRITICAL FIX: Overwrite all corrupted snapshots in the chat history so swiping doesn't restore the broken 2024 time!
            for (let j = 0; j < context.chat.length; j++) {
                if (context.chat[j].extra && context.chat[j].extra.stateTrackerSnapshot) {
                    // Update only the time to match the initial state, preserving other changes if any, OR just overwrite the whole state
                    // Safest is to just overwrite the time, but since they are at the start, overwriting entirely is fine.
                    context.chat[j].extra.stateTrackerSnapshot = JSON.parse(JSON.stringify(targetSnapshot));
                }
            }
            if (SillyTavern.getContext().saveChat) SillyTavern.getContext().saveChat();
            
            saveAndUpdateHUD();
            toastr.success("Sincronizado correctamente con el estado inicial del chat.", "State Tracker");
            import('./ui/metadataViewer.js').then(module => {
                if (module.refreshAllWidgets) module.refreshAllWidgets();
            });
        } else {
            toastr.error("No se encontró ningún snapshot en los primeros turnos.", "State Tracker");
        }
    });

    $('#state_tracker_24h').off('change').on('change', function() {
        extension_settings.stateTracker.use24Hour = $(this).prop('checked');
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => {
            if (module.refreshAllWidgets) module.refreshAllWidgets();
        });
    });
    
    $('#st_lang_ui, #st_lang_prompt').off('change').on('change', function() {
        extension_settings.stateTracker.lang = {
            ui: $('#st_lang_ui').val(),
            prompt: $('#st_lang_prompt').val()
        };
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => {
            if (module.refreshAllWidgets) module.refreshAllWidgets();
        });
    });
    
    // Weather handlers
    $('#st_weather_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.weather.enabled = $(this).prop('checked');
        saveAndUpdateHUD();
    });
    
    // Biology
    $('#st_bio_enabled').off('change').on('change', function() {
        if (!extension_settings.stateTracker.biology_config) extension_settings.stateTracker.biology_config = {};
        extension_settings.stateTracker.biology_config.enabled = $(this).prop('checked');
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
    });
    
    $(document).off('change', '.st_bio_sys_toggle').on('change', '.st_bio_sys_toggle', function() {
        const key = $(this).data('key');
        if (!extension_settings.stateTracker.biology_config) extension_settings.stateTracker.biology_config = {};
        extension_settings.stateTracker.biology_config[key] = $(this).prop('checked');
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
    });
    $('#st_weather_temp_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.weather.temperatureEnabled = $(this).prop('checked');
        saveAndUpdateHUD();
    });
    $('#st_weather_temp_preset').off('change').on('change', function() {
        extension_settings.stateTracker.weather.tempPreset = $(this).val();
        saveAndUpdateHUD();
    });
    
    // Wardrobe handlers
    $('#st_clothing_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.clothing_enabled = $(this).prop('checked');
        saveAndUpdateHUD();
        import('./ui/metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
    });
    
    $('#st_char_sex').off('change').on('change', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (profile) {
            profile.sex = $(this).val();
            saveAndUpdateHUD();
        }
    });
    
    $('#st_wd_btn_add').off('click').on('click', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile) return;
        
        let id = $('#st_wd_new_id').val().trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const name = $('#st_wd_new_name').val().trim();
        const slot = $('#st_wd_new_slot').val();
        
        if (!id || !name) {
            toastr.error("Falta ID o Nombre");
            return;
        }
        
        profile.wardrobe.items[id] = { name, slot };
        saveAndUpdateHUD();
        $('#st_wd_new_id').val('');
        $('#st_wd_new_name').val('');
        renderWardrobe();
    });
    
    
    

    
    $(document).off('click', '.st_wd_edit_item').on('click', '.st_wd_edit_item', function() {
        const oldId = $(this).data('id');
        
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile || !profile.wardrobe.items[oldId]) return;
        
        const oldName = profile.wardrobe.items[oldId].name || '';
        const oldNameEn = profile.wardrobe.items[oldId].name_en || '';
        
        $('.st-wd-edit-modal').remove();
        
        const modalHtml = `
        <div class="st-wd-edit-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(5px);">
            <div style="background: var(--SmartThemeBlurTintColor, #151515); border: 1px solid var(--SmartThemeBorderColor, #444); padding: 20px; border-radius: 8px; width: 90%; max-width: 350px; box-shadow: 0 10px 30px rgba(0,0,0,0.9);">
                <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1.2em; color: #fff; text-align: center;">Editar Prenda</h4>
                
                <label style="font-size: 0.85em; opacity: 0.8; display: block; margin-bottom: 5px;">ID Interno (No tocar):</label>
                <input type="text" id="st_wd_edit_inp_id" class="text_input" value="${oldId}" style="width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 10px; font-size: 0.95em; background: rgba(0,0,0,0.7) !important; color: #fff !important; border: 1px solid #555 !important; border-radius: 4px;">
                
                <label style="font-size: 0.85em; opacity: 0.8; display: block; margin-bottom: 5px;">Nombre (Para ti en UI):</label>
                <input type="text" id="st_wd_edit_inp_name" class="text_input" value="${oldName}" style="width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 10px; font-size: 0.95em; background: rgba(0,0,0,0.7) !important; color: #fff !important; border: 1px solid #555 !important; border-radius: 4px;">
                
                <label style="font-size: 0.85em; opacity: 0.8; display: block; margin-bottom: 5px;">Nombre en Inglés (Para el LLM):</label>
                <input type="text" id="st_wd_edit_inp_name_en" class="text_input" value="${oldNameEn}" placeholder="Opcional. Deja vacío para usar el mismo." style="width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 20px; font-size: 0.95em; background: rgba(0,0,0,0.7) !important; color: #fff !important; border: 1px solid #555 !important; border-radius: 4px;">
                
                <div style="display: flex; gap: 10px;">
                    <button class="menu_button st_wd_edit_btn_save" style="flex: 1; padding: 12px; margin: 0; background: #006400; color: white; font-weight: bold; border-radius: 4px; border: none;">Guardar</button>
                    <button class="menu_button st_wd_edit_btn_cancel" style="flex: 1; padding: 12px; margin: 0; background: #900; color: white; font-weight: bold; border-radius: 4px; border: none;">Cancelar</button>
                </div>
            </div>
        </div>`;
        
        $('body').append(modalHtml);
        
        $('.st_wd_edit_btn_cancel').off('click').on('click', function() {
            $('.st-wd-edit-modal').fadeOut(150, function() { $(this).remove(); });
        });
        
        $('.st_wd_edit_btn_save').off('click').on('click', function() {
            let newId = $('#st_wd_edit_inp_id').val().trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
            let newName = $('#st_wd_edit_inp_name').val().trim();
            let newNameEn = $('#st_wd_edit_inp_name_en').val().trim();
            
            if (!newNameEn) newNameEn = newName;
            
            if (!newId || !newName) {
                toastr.error("ID y Nombre son obligatorios.");
                return;
            }
            
            const avatar = getCharacterAvatar();
            const profile = getCharacterProfile(avatar);
            if (!profile) return;
            
            if (newId !== oldId) {
                if (profile.wardrobe.items[newId]) {
                    toastr.error("El ID '" + newId + "' ya existe.");
                    return;
                }
                
                // Mover datos
                profile.wardrobe.items[newId] = profile.wardrobe.items[oldId];
                delete profile.wardrobe.items[oldId];
                
                // Actualizar nombre
                profile.wardrobe.items[newId].name = newName;
                profile.wardrobe.items[newId].name_en = newNameEn;
                
                // Actualizar Outfits (Cascada)
                for (let oId in profile.wardrobe.outfits) {
                    let itemsArray = profile.wardrobe.outfits[oId];
                    let idx = itemsArray.indexOf(oldId);
                    if (idx !== -1) {
                        itemsArray[idx] = newId;
                    }
                }
            } else {
                profile.wardrobe.items[oldId].name = newName;
                profile.wardrobe.items[oldId].name_en = newNameEn;
            }
            
            saveAndUpdateHUD();
            renderWardrobe();
            $('.st-wd-edit-modal').remove();
            toastr.success("Prenda modificada con éxito.", "State Tracker");
        });
    });

    
    $(document).off('change', '.st_wd_edit_item_name').on('change', '.st_wd_edit_item_name', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile) return;
        const id = $(this).data('id');
        const newName = $(this).val().trim();
        
        if (newName && profile.wardrobe.items[id]) {
            profile.wardrobe.items[id].name = newName;
            profile.wardrobe.items[id].name_en = newName; // Sincroniza el ingles para el LLM
            saveAndUpdateHUD();
            toastr.success("Prenda renombrada: " + newName, "State Tracker");
        } else if (!newName) {
            // Revert si lo dejan vacio
            $(this).val(profile.wardrobe.items[id].name);
        }
    });

    $(document).off('click', '.st_wd_del_item').on('click', '.st_wd_del_item', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile) return;
        const id = $(this).data('id');
        delete profile.wardrobe.items[id];
        
        // Remove from outfits if it was there
        for (let oId in profile.wardrobe.outfits) {
            profile.wardrobe.outfits[oId] = profile.wardrobe.outfits[oId].filter(i => i !== id);
        }
        
        saveAndUpdateHUD();
        renderWardrobe();
    });
    
    $('#st_outfit_btn_add').off('click').on('click', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile) return;
        
        const id = $('#st_outfit_new_id').val().trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!id) return;
        
        const itemsRaw = $('#st_outfit_new_items').val().trim();
        const itemsArray = itemsRaw.split(',').map(i => i.trim().toLowerCase()).filter(i => profile.wardrobe.items[i]);
        
        profile.wardrobe.outfits[id] = itemsArray;
        saveAndUpdateHUD();
        $('#st_outfit_new_id').val('');
        $('#st_outfit_new_items').val('');
        renderWardrobe();
    });
    
    $(document).off('click', '.st_outfit_del').on('click', '.st_outfit_del', function() {
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        if (!profile) return;
        const id = $(this).data('id');
        delete profile.wardrobe.outfits[id];
        saveAndUpdateHUD();
        renderWardrobe();
    });
    
    $('.st_weather_en_cb').off('change').on('change', function() {
        const key = $(this).data('key');
        if (extension_settings.stateTracker.weather.probabilities[key]) {
            extension_settings.stateTracker.weather.probabilities[key].enabled = $(this).prop('checked');
            saveAndUpdateHUD();
        }
    });
    $('.st_weather_w_input').off('input').on('input', function() {
        const key = $(this).data('key');
        let val = parseInt($(this).val());
        if (isNaN(val) || val < 0) val = 0;
        if (extension_settings.stateTracker.weather.probabilities[key]) {
            extension_settings.stateTracker.weather.probabilities[key].weight = val;
            saveAndUpdateHUD();
        }
    });
    
    $('#st_weather_reset_weights').off('click').on('click', function() {
        if (!confirm("¿Restablecer todas las probabilidades climáticas a sus valores predeterminados?")) return;
        
        for (let key in WEATHER_DICTIONARY) {
            extension_settings.stateTracker.weather.probabilities[key] = { enabled: true, weight: 10 };
        }
        ['heatwave', 'cold_snap', 'sandstorm', 'blizzard', 'thunderstorm'].forEach(k => {
            if (extension_settings.stateTracker.weather.probabilities[k]) {
                extension_settings.stateTracker.weather.probabilities[k].weight = 2;
            }
        });
        ['clear', 'partly_cloudy', 'overcast'].forEach(k => {
            if (extension_settings.stateTracker.weather.probabilities[k]) {
                extension_settings.stateTracker.weather.probabilities[k].weight = 50;
            }
        });
        
        saveAndUpdateHUD();
        renderSettings();
        toastr.success("Pesos climáticos restablecidos.");
    });
    
    // Calendar handlers
    $('#st_calendar_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.events.enabled = $(this).prop('checked');
        saveAndUpdateHUD();
    });
    
    $(document).off('change', '#st_cal_char_bday').on('change', '#st_cal_char_bday', function() {
        const val = $(this).val();
        const context = SillyTavern.getContext();
        if (context.chatId) {
            const chatData = extension_settings.stateTracker.chats[context.chatId];
            if (chatData && chatData.calendar) {
                chatData.calendar.charBirthdate = val ? new Date(val).getTime() : null;
                saveAndUpdateHUD();
                import('./ui/metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
            }
        }
    });
    $(document).off('change', '#st_cal_user_bday').on('change', '#st_cal_user_bday', function() {
        const val = $(this).val();
        const context = SillyTavern.getContext();
        if (context.chatId) {
            const chatData = extension_settings.stateTracker.chats[context.chatId];
            if (chatData && chatData.calendar) {
                chatData.calendar.userBirthdate = val ? new Date(val).getTime() : null;
                saveAndUpdateHUD();
                import('./ui/metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
            }
        }
    });
    
    function handleAgeCalc(inputId, dateInputId, isChar) {
        $(document).off('change', inputId).on('change', inputId, async function() {
            const age = parseInt($(this).val());
            if (isNaN(age) || age < 0) return;
            
            let ts = Date.UTC(2024, 0, 1, 8, 0);
            const context = SillyTavern.getContext();
            
            // Prefer Turn 0 time if available
            if (context.chat && context.chat.length > 0 && context.chat[0].extra && context.chat[0].extra.stateTrackerSnapshot && context.chat[0].extra.stateTrackerSnapshot.time) {
                const t0 = context.chat[0].extra.stateTrackerSnapshot.time;
                if (t0.timestamp !== undefined) ts = t0.timestamp;
                else if (t0.minutes !== undefined) ts += t0.minutes * 60000;
            } else {
                // Fallback to global current time
                const { getCharacterData } = await import('./core/stateManager.js');
                const data = getCharacterData();
                if (data && data.time) {
                    if (data.time.timestamp !== undefined) ts = data.time.timestamp;
                    else if (data.time.minutes !== undefined) ts += data.time.minutes * 60000;
                }
            }
            
            const currentD = new Date(ts);
            const targetYear = currentD.getUTCFullYear() - age;
            
            const dateInput = $(dateInputId);
            let currentVal = dateInput.val();
            let month = "01";
            let day = "01";
            
            if (currentVal) {
                const parts = currentVal.split('-');
                if (parts.length === 3) {
                    month = parts[1];
                    day = parts[2];
                }
            }
            
            const newVal = `${targetYear}-${month}-${day}`;
            dateInput.val(newVal).trigger('change');
            $(this).val(''); // Clear the age input after calculating
            toastr.success(`Año de nacimiento calculado: ${targetYear}`);
        });
    }
    
    handleAgeCalc('#st_cal_char_age_calc', '#st_cal_char_bday', true);
    handleAgeCalc('#st_cal_user_age_calc', '#st_cal_user_bday', false);
    
    $(document).off('change', '#st_cal_new_recurrent').on('change', '#st_cal_new_recurrent', function() {
        if ($(this).prop('checked')) {
            $('#st_cal_new_year').hide();
        } else {
            $('#st_cal_new_year').show();
        }
    });
    
    $(document).off('click', '#st_cal_btn_add').on('click', '#st_cal_btn_add', function() {
        const name = $('#st_cal_new_name').val().trim();
        const desc = $('#st_cal_new_desc').val().trim();
        const month = parseInt($('#st_cal_new_month').val());
        const day = parseInt($('#st_cal_new_day').val());
        const recurrent = $('#st_cal_new_recurrent').prop('checked');
        const year = recurrent ? null : parseInt($('#st_cal_new_year').val());
        
        if (!name || isNaN(month) || isNaN(day)) {
            toastr.error("Nombre, Mes y Día son requeridos.");
            return;
        }
        
        addEvent({ name, desc, month, day, recurrent, year });
        $('#st_cal_new_name').val('');
        $('#st_cal_new_desc').val('');
        renderSettings();
    });
    
    $(document).off('click', '.st_cal_btn_del').on('click', '.st_cal_btn_del', function() {
        const id = $(this).data('id');
        removeEvent(id);
        renderSettings();
    });
}

jQuery(() => {
    let weatherProbHtml = `<div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px; max-height: 250px; overflow-y: auto; padding-right: 5px; border: 1px solid rgba(255,255,255,0.1); padding: 10px; border-radius: 6px;">`;
    for (let key in WEATHER_DICTIONARY) {
        const def = WEATHER_DICTIONARY[key];
        weatherProbHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px;">
                <label style="display: flex; align-items: center; cursor: pointer; flex: 1; margin: 0; font-size: 0.9em;" title="${def.desc}">
                    <input type="checkbox" class="st_weather_en_cb" id="st_weather_en_${key}" data-key="${key}" style="margin-right: 8px;">
                    ${def.name}
                </label>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="font-size: 0.8em; opacity: 0.7;">Peso:</span>
                    <input type="number" class="st_weather_w_input text_input" id="st_weather_w_${key}" data-key="${key}" min="0" max="100" style="width: 60px; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                </div>
            </div>
        `;
    }
    weatherProbHtml += `</div>`;
    
    let tempPresetsHtml = "";
    for (let key in TEMPERATURE_PRESETS) {
        tempPresetsHtml += `<option value="${key}">${TEMPERATURE_PRESETS[key].name}</option>`;
    }

    const settingsContainer = $(document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings'));
    if (settingsContainer.length > 0) {
        const html = `
            <div class="state_tracker_settings" style="margin-bottom: 20px;">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>State & Variables Tracker</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display: none; padding: 10px;">
                        <div style="margin-bottom: 10px; font-size: 0.95em; opacity: 0.9;">
                            Allows creating and tracking custom key-value variables (such as location, outfits, physical positions, appearance, money, and time). The LLM can write updates dynamically.
                        </div>
                        <label for="state_tracker_enabled" class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                            <input type="checkbox" id="state_tracker_enabled" name="state_tracker_enabled" style="margin-right: 8px;">
                            Enable State & Variables Tracking
                        </label>
                        <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;"></div>
                        <label for="state_tracker_time_enabled" class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 10px;">
                            <input type="checkbox" id="state_tracker_time_enabled" name="state_tracker_time_enabled" style="margin-right: 8px;">
                            Enable Time Engine
                        </label>
                        <button class="menu_button" id="st_btn_sync_turn0" style="margin-left: 20px; margin-bottom: 15px; font-size: 0.85em; padding: 4px 8px; background: rgba(50,150,250,0.2); border: 1px solid rgba(50,150,250,0.5); border-radius: 4px;"><i class="fa-solid fa-clock-rotate-left"></i> Sincronizar Fecha con Turno 0</button>
                        <label for="state_tracker_24h" class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; margin-bottom: 15px; margin-left: 20px; opacity: 0.9;">
                            <input type="checkbox" id="state_tracker_24h" name="state_tracker_24h" style="margin-right: 8px;">
                            Use 24-hour visual format (Widget only)
                        </label>
                        
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; margin-top: 15px;">
                            <strong style="color: #aaccff; font-size: 0.9em; margin-bottom: 10px; display: block;"><i class="fa-solid fa-language"></i> Idiomas y Localización</strong>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <span style="font-size: 0.85em; opacity: 0.9;">Idioma del Widget (UI):</span>
                                <select id="st_lang_ui" class="text_input" style="width: 120px; padding: 4px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <option value="es">Español</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <span style="font-size: 0.85em; opacity: 0.9;">Idioma de Prompt (LLM):</span>
                                <select id="st_lang_prompt" class="text_input" style="width: 120px; padding: 4px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <option value="en">English</option>
                                    <option value="es">Español</option>
                                </select>
                            </div>
                        </div>
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; margin-top: 15px;">
                            <strong style="color: #aaccff; font-size: 0.9em; margin-bottom: 5px; display: block;"><i class="fa-solid fa-syringe"></i> Configuración del LLM (Saliency)</strong>
                            <div style="font-size: 0.8em; opacity: 0.8; margin-bottom: 10px; line-height: 1.3;">
                                Define dónde se inyecta el rastreador de estado. Mientras más al fondo (IN_CHAT / Author's Note), más caso le hará el LLM (menor decadencia de contexto).
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <span style="font-size: 0.85em; opacity: 0.9;" title="Ubicación estructural del texto.">Posición de Inyección:</span>
                                <select id="st_prompt_pos" class="text_input" style="width: 160px; padding: 4px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <option value="0">IN_PROMPT (Arriba / Débil)</option>
                                    <option value="1">Author's Note (Fondo)</option>
                                    <option value="2">IN_CHAT (Fondo Absoluto)</option>
                                </select>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
                                <span style="font-size: 0.85em; opacity: 0.9;" title="0 = Inmediatamente antes de la IA. 1 = Antes de tu último mensaje, etc.">Profundidad (0 a 10):</span>
                                <input type="number" id="st_prompt_depth" class="text_input" style="width: 60px; padding: 4px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;" min="0" max="10" title="Mensajes de distancia desde el final. 0 = Máxima atención.">
                            </div>
                            <div style="font-size: 0.75em; opacity: 0.6; font-style: italic;">* Recomendado: IN_CHAT con Profundidad 0.</div>
                        </div>
                        
                        <div class="inline-drawer" style="margin-top: 15px; border: 1px solid rgba(0, 150, 255, 0.3); border-radius: 8px;">
                            <div class="inline-drawer-toggle inline-drawer-header" style="background: rgba(0, 100, 200, 0.1); border-radius: 8px;">
                                <b><i class="fa-solid fa-cloud-sun-rain" style="margin-right: 6px;"></i>Eventos Climáticos</b>
                                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                            </div>
                            <div class="inline-drawer-content" style="display: none; padding: 12px;">
                                <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                                    <input type="checkbox" id="st_weather_enabled" style="margin-right: 8px;">
                                    Activar Motor de Clima
                                </label>
                                
                                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                    <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 10px; color: #aaccff;">
                                        <input type="checkbox" id="st_weather_temp_enabled" style="margin-right: 8px;">
                                        Sistema de Temperatura (Celcius)
                                    </label>
                                    <div style="display: flex; align-items: center; margin-left: 24px; gap: 10px;">
                                        <span style="font-size: 0.9em; opacity: 0.9;">Preset Estacional:</span>
                                        <select id="st_weather_temp_preset" class="text_input" style="flex: 1; padding: 5px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                            ${tempPresetsHtml}
                                        </select>
                                    </div>
                                </div>
                                
                                
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                    <strong style="font-size: 0.9em; opacity: 0.9;">Probabilidades Climáticas (Pesos)</strong>
                                    <button class="menu_button" id="st_weather_reset_weights" style="font-size: 0.75em; padding: 4px 8px; margin: 0; background: rgba(150,0,0,0.5); border-radius: 4px; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-rotate-left"></i> Restablecer</button>
                                </div>
                                ${weatherProbHtml}
                            </div>
                        </div>
                        
                        <div class="inline-drawer" style="margin-top: 15px; border: 1px solid rgba(255, 100, 200, 0.3); border-radius: 8px;">
                            <div class="inline-drawer-toggle inline-drawer-header" style="background: rgba(200, 0, 100, 0.1); border-radius: 8px;">
                                <b><i class="fa-solid fa-calendar-days" style="margin-right: 6px;"></i>Gestor de Eventos y Edades</b>
                                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                            </div>
                            <div class="inline-drawer-content" style="display: none; padding: 12px;">
                                <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                                    <input type="checkbox" id="st_calendar_enabled" style="margin-right: 8px;">
                                    Activar Motor de Calendario
                                </label>
                                
                                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                    <strong style="color: #ffaaee; font-size: 0.9em; margin-bottom: 10px; display: block;">Fechas de Nacimiento (Chat Actual)</strong>
                                    <div id="st_calendar_birth_container">
                                        <!-- Will be rendered dynamically based on active chat -->
                                    </div>
                                </div>
                                
                                <strong style="font-size: 0.9em; opacity: 0.9;">Calendario Global de Eventos</strong>
                                <div id="st_calendar_events_container" style="margin-top: 10px; margin-bottom: 10px;">
                                </div>
                                
                                <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                                    <strong style="font-size: 0.85em; opacity: 0.8; margin-bottom: 5px; display: block;">Añadir Nuevo Evento</strong>
                                    <input type="text" id="st_cal_new_name" class="text_input" placeholder="Nombre (ej. Navidad)" style="width: 100%; margin-bottom: 5px; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <input type="text" id="st_cal_new_desc" class="text_input" placeholder="Contexto (ej. La gente intercambia regalos)" style="width: 100%; margin-bottom: 5px; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                                        <select id="st_cal_new_month" class="text_input" style="flex: 1; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                            <option value="0">Ene</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Abr</option>
                                            <option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Ago</option>
                                            <option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dic</option>
                                        </select>
                                        <input type="number" id="st_cal_new_day" class="text_input" placeholder="Día" min="1" max="31" style="flex: 1; padding: 5px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    </div>
                                    <label style="display: flex; align-items: center; font-size: 0.85em; cursor: pointer; margin-bottom: 8px;">
                                        <input type="checkbox" id="st_cal_new_recurrent" checked style="margin-right: 5px;"> Recurrente cada año
                                    </label>
                                    <input type="number" id="st_cal_new_year" class="text_input" placeholder="Año (si no es recurrente)" style="width: 100%; padding: 5px; font-size: 0.85em; display: none; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                    <button class="menu_button" id="st_cal_btn_add" style="width: 100%; margin-top: 5px; font-weight: bold; font-size: 0.85em; padding: 6px;"><i class="fa-solid fa-plus"></i> Añadir Evento</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="inline-drawer" style="margin-top: 15px; border: 1px solid rgba(100, 255, 100, 0.3); border-radius: 8px;">
                            <div class="inline-drawer-toggle inline-drawer-header" style="background: rgba(0, 150, 0, 0.1); border-radius: 8px;">
                                <b><i class="fa-solid fa-heart-pulse" style="margin-right: 6px;"></i>Simulador Biológico</b>
                                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                            </div>
                            <div class="inline-drawer-content" style="display: none; padding: 12px;">
                                <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                                    <input type="checkbox" id="st_bio_enabled" style="margin-right: 8px;">
                                    Activar Funciones Biológicas
                                </label>
                                <div id="st_bio_systems_container" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
                                    <!-- Populated by JS -->
                                </div>
                            </div>
                        </div>
                        <div class="inline-drawer" style="margin-top: 15px; border: 1px solid rgba(200, 100, 255, 0.3); border-radius: 8px;">
                            <div class="inline-drawer-toggle inline-drawer-header" style="background: rgba(150, 0, 200, 0.1); border-radius: 8px;">
                                <b><i class="fa-solid fa-shirt" style="margin-right: 6px;"></i>Perfil y Armario</b>
                                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                            </div>
                            <div class="inline-drawer-content" style="display: none; padding: 12px;">
                                <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                                    <input type="checkbox" id="st_clothing_enabled" style="margin-right: 8px;">
                                    Activar Motor de Vestimenta y Anatomía
                                </label>
                                
                                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                    <strong style="color: #ddaaff; font-size: 0.9em; margin-bottom: 10px; display: block;">Identidad Anatómica de {{char}}</strong>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <div style="flex: 1;">
                                            <label style="font-size: 0.8em; opacity: 0.8; margin-bottom: 3px; display: block;">Sexo Biológico</label>
                                            <select id="st_char_sex" class="text_input" style="width: 100%; padding: 5px; background: rgba(10,15,20,0.8) !important; color: white !important;">
                                                <option value="female">Femenino (Mujer)</option>
                                                <option value="male">Masculino (Hombre)</option>
                                                <option value="other">Otro (Genitales neutrales)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px;">
                                    <strong style="color: #ddaaff; font-size: 0.9em; margin-bottom: 10px; display: block;">Inventario de Prendas</strong>
                                    <div id="st_wardrobe_items_container" style="max-height: 200px; overflow-y: auto; margin-bottom: 10px;"></div>
                                    
                                    <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">
                                        <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px;">
                                            <input type="text" id="st_wd_new_id" class="text_input" placeholder="id_snake_case" style="min-width: 120px; flex: 1; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                            <input type="text" id="st_wd_new_name" class="text_input" placeholder="Nombre en UI (ej. Camiseta)" style="min-width: 150px; flex: 2; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                        </div>
                                        <div style="display: flex; flex-wrap: wrap; gap: 5px; align-items: center;">
                                            <select id="st_wd_new_slot" class="text_input" style="min-width: 150px; flex: 1; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                            </select>
                                            <button class="menu_button" id="st_wd_btn_add" style="padding: 4px 15px; font-weight: bold; font-size: 0.85em; flex-shrink: 0;"><i class="fa-solid fa-plus"></i></button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
                                    <strong style="color: #ddaaff; font-size: 0.9em; margin-bottom: 10px; display: block;">Conjuntos (Outfits)</strong>
                                    <div id="st_wardrobe_outfits_container" style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;"></div>
                                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                                        <input type="text" id="st_outfit_new_id" class="text_input" placeholder="id_outfit (ej. pijama)" style="min-width: 120px; flex: 1; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                        <input type="text" id="st_outfit_new_items" class="text_input" placeholder="items separados por coma" style="min-width: 150px; flex: 2; padding: 4px; font-size: 0.85em; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                                        <button class="menu_button" id="st_outfit_btn_add" style="padding: 4px 15px; font-weight: bold; font-size: 0.85em; flex-shrink: 0;"><i class="fa-solid fa-plus"></i> Añadir</button>
                                    </div>
                                </div>
                                
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        settingsContainer.append(html);
    }

    // 2. Append quick access option to the Hamburger Menu (three stacked lines)
    const quickOption = $(`
        <a id="option_state_tracker" style="cursor: pointer;">
            <i class="fa-lg fa-solid fa-sliders"></i>
            <span data-i18n="State Tracker">State Tracker</span>
        </a>
    `);
    quickOption.on('click', function() {
        $('#options').hide();
        showQuickStatePopup();
    });
    $('#options .options-content').append(quickOption);

    // Setup handlers and render
    renderSettings();
    setupUIHandlers();

    // Register event listeners
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onGenerateBeforeCombinePrompts);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    eventSource.on(event_types.CHAT_CHANGED, updateHUD);
    eventSource.on(event_types.CHAT_CHANGED, renderSettings);

    // Import and register new persistence hooks dynamically to avoid breaking existing imports at the top
    import('./core/persistenceManager.js').then(module => {
        if (event_types.MESSAGE_DELETED) eventSource.on(event_types.MESSAGE_DELETED, module.onMessageDeleted);
        if (event_types.MESSAGE_SWIPED) eventSource.on(event_types.MESSAGE_SWIPED, module.onMessageSwiped);
    }).catch(err => console.error("Failed to load persistenceManager:", err));

    import('./ui/metadataViewer.js').then(module => {
        if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, module.refreshAllWidgets);
        if (event_types.MESSAGE_RECEIVED) eventSource.on(event_types.MESSAGE_RECEIVED, module.refreshAllWidgets);
        if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, module.refreshAllWidgets);
        if (event_types.MESSAGE_UPDATED) eventSource.on(event_types.MESSAGE_UPDATED, module.refreshAllWidgets);
        // Estos eventos se emiten DESPUÉS de que el nodo DOM del mensaje existe
        // (addOneMessage), a diferencia de MESSAGE_SENT/RECEIVED que van antes.
        // Sin ellos el widget nunca se adjunta al turno del usuario.
        if (event_types.USER_MESSAGE_RENDERED) eventSource.on(event_types.USER_MESSAGE_RENDERED, module.refreshAllWidgets);
        if (event_types.CHARACTER_MESSAGE_RENDERED) eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, module.refreshAllWidgets);
        // Initial render for existing messages
        setTimeout(module.refreshAllWidgets, 500);
    }).catch(err => console.error("Failed to load metadataViewer:", err));
}
);

setTimeout(updateHUD, 2000); // Initial load
