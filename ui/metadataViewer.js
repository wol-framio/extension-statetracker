import { extension_settings } from '../../../../extensions.js';
import { getTokenCountAsync } from '../../../../tokenizers.js';
import { getTimestamp, parseTimestamp, advanceTimeBy, DEFAULT_EPOCH } from '../core/timeEngine.js';
import { WEATHER_DICTIONARY, generateWeather } from '../core/weatherEngine.js';
import { calculateAges, getActiveEvents } from '../core/calendarEngine.js';
import { getBiologyPrompt } from '../core/biologyEngine.js';
import { getClothingPrompt, getCharacterProfile, initClothingState } from '../core/clothingEngine.js';
import { getCharacterAvatar } from '../core/stateManager.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { executeTinyLLM } from '../core/tinyLLMEngine.js';
import { generateRaw } from '../../../../../script.js';
async function renderSnapshotModal(mesId, message) {
    const context = SillyTavern.getContext();
    const { Popup } = context;
    const snapshot = message.extra.stateTrackerSnapshot;
    
    if (!extension_settings.stateTracker.tinyLLM) {
        extension_settings.stateTracker.tinyLLM = {
            sysprompt: "Eres un sistema de rastreo de estado oculto. Analiza la conversación y el estado actual. Extrae las nuevas variables y cambios que ocurran lógicamente en base a las acciones de los personajes. Responde ÚNICAMENTE con un JSON puro con este formato: {\"StateTracker\": {\"nombre_variable\": \"nuevo_valor\"}}",
            ctxCount: 1,
            profile: 'main_api',
            maxTokens: 200,
            autoUpdate: false
        };
    }
    const tinyCfg = extension_settings.stateTracker.tinyLLM;
    
    let cleanSnapshot = {};
    let formatted = "";
    try {
        if (snapshot && snapshot.groups) {
            snapshot.groups.forEach(group => { cleanSnapshot[group.name] = group.variables; });
            if (snapshot.time) cleanSnapshot.time = snapshot.time;
            if (snapshot.weather) cleanSnapshot.weather = snapshot.weather;
            if (snapshot.calendar) cleanSnapshot.calendar = snapshot.calendar;
            if (snapshot.clothing) cleanSnapshot.clothing = snapshot.clothing;
            if (snapshot.biology) cleanSnapshot.biology = snapshot.biology;
        } else { cleanSnapshot = snapshot; }
        formatted = JSON.stringify(cleanSnapshot, null, 2);
    } catch (e) { formatted = "Error parsing snapshot data."; }

    let profilesHtml = '<option value="main_api">-- Main API (La que usas actualmente) --</option>';
    const domSelect = document.getElementById('connection_profiles');
    if (domSelect && domSelect.options) {
        for (let i = 0; i < domSelect.options.length; i++) {
            const opt = domSelect.options[i];
            const sel = (tinyCfg.profile === opt.value) ? 'selected' : '';
            profilesHtml += `<option value="${opt.value}" ${sel}>${opt.text}</option>`;
        }
    }

    const html = `
        <div style="text-align: left; font-size: 0.9em; margin-top: 10px; max-height: 75vh; overflow-y: auto; overflow-x: hidden; padding-right: 10px;">
            <div style="background: rgba(0, 50, 100, 0.4); border: 1px solid rgba(0, 150, 255, 0.5); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: #aaddff; border-bottom: 1px solid rgba(0,150,255,0.3); padding-bottom: 5px;"><i class="fa-solid fa-microchip"></i> Gestor de Estado (Tiny LLM)</h3>
                
                <!-- TOGGLE MAESTRO -->
                <div style="background: rgba(0,0,0,0.6); padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #555;">
                    <label style="cursor: pointer; display: flex; align-items: center; color: white;">
                        <input type="checkbox" id="st_tiny_master_enabled" style="margin-right: 10px; transform: scale(1.3);" ${tinyCfg.enabled !== false ? 'checked' : ''}>
                        <div style="display:flex; flex-direction:column;">
                            <strong style="font-size: 1.1em; color: #55ff55;">Habilitar Sistema Tiny LLM</strong>
                            <span style="font-size: 0.75em; color: #aaa; margin-top:4px;">Si desactivas esto, el LLM Principal volverá a hacer todo el trabajo (comportamiento original clásico).</span>
                        </div>
                    </label>
                </div>
                
                <div id="st_tiny_settings_container" style="display: ${tinyCfg.enabled !== false ? 'block' : 'none'};">
                    <p style="font-size: 0.85em; opacity: 0.9; margin-bottom: 15px;">Este panel te permite usar una API diferente o un LLM más barato para leer el mensaje de este turno y actualizar variables de estado sin gastar tokens de tu LLM principal.</p>

                    <!-- APILADO VERTICAL ESTRICTO PARA MÓVILES -->
                    
                    <!-- 1. Perfil API -->
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #00aaff; margin-bottom: 15px; width: 100%;">
                        <label style="font-weight: bold; color: #fff; display:block; margin-bottom: 4px;">1. ¿Qué API o modelo usará este sistema?</label>
                        <p style="font-size: 0.75em; color: #aaa; margin: 0 0 8px 0;">Elige uno de tus perfiles guardados (ej. tu OpenRouter barato). Si eliges 'Main API', usará el LLM principal.</p>
                        <select id="st_tiny_profile" class="text_input" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.7)!important; color: white!important;">${profilesHtml}</select>
                    </div>
                    
                    <!-- 2. Max Tokens -->
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #00aaff; margin-bottom: 15px; width: 100%;">
                        <label style="font-weight: bold; color: #fff; display:block; margin-bottom: 4px;">2. Max de Tokens (Salida)</label>
                        <p style="font-size: 0.75em; color: #aaa; margin: 0 0 8px 0;">Límite de palabras generadas por el Tiny LLM. (Ponlo en 200 para que responda rápido y corte el exceso).</p>
                        <input type="number" id="st_tiny_maxtokens" class="text_input" value="${tinyCfg.maxTokens || 200}" min="10" max="1000" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.7)!important; color: white!important;">
                    </div>

                    <!-- 3. Mensajes Contexto -->
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #00aaff; margin-bottom: 15px; width: 100%;">
                        <label style="font-weight: bold; color: #fff; display:block; margin-bottom: 4px;">3. Mensajes de Contexto</label>
                        <p style="font-size: 0.75em; color: #aaa; margin: 0 0 8px 0;">¿Cuántos mensajes lee hacia atrás? Poner "1": Lee este turno. "2": Este turno y tu repuesta anterior.</p>
                        <input type="number" id="st_tiny_ctx" class="text_input" value="${tinyCfg.ctxCount}" min="1" max="10" style="width: 100%; padding: 8px; background: rgba(0,0,0,0.7)!important; color: white!important;">
                    </div>
                    
                    <!-- 4. System Prompt -->
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #00aaff; margin-bottom: 15px; width: 100%;">
                        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <label style="font-weight: bold; color: #fff;">4. Instrucciones del Tiny LLM (System Prompt)</label>
                            <span id="st_tiny_save_status" style="color: #55ff55; font-size: 0.8em; display: none; font-weight: bold;">¡Guardado! ✓</span>
                        </div>
                        <p style="font-size: 0.75em; color: #aaa; margin: 0 0 8px 0;">Dile al Tiny LLM cómo debe extraer la ropa y variables. Esto se autoguarda al teclear.</p>
                        <textarea id="st_tiny_sysprompt" class="text_input" style="width: 100%; height: 90px; padding: 8px; background: rgba(0,0,0,0.7)!important; color: white!important;">${tinyCfg.sysprompt}</textarea>
                        
                        <!-- AVANZADO: Prompts Estructurales -->
                        <div style="margin-top: 10px;">
                            <label style="font-weight: bold; font-size: 0.85em; cursor: pointer; color: #aaa;" id="st_tiny_adv_toggle">
                                <i class="fa-solid fa-caret-right" id="st_tiny_adv_icon"></i> Mostrar Ajustes Avanzados de Prompt
                            </label>
                            <div id="st_tiny_adv_container" style="display: none; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; margin-top: 5px;">
                                <label style="font-size: 0.8em;">Header Contexto</label>
                                <input type="text" class="text_input" id="st_tiny_p_ctx" style="width:100%; margin-bottom:5px; padding:4px; background: rgba(0,0,0,0.7)!important; color: white!important; border: 1px solid #555;" value="${extension_settings.stateTracker.tinyLLM?.prompts?.header_context || '[Context]'}">
                                
                                <label style="font-size: 0.8em;">Header Estado</label>
                                <input type="text" class="text_input" id="st_tiny_p_state" style="width:100%; margin-bottom:5px; padding:4px; background: rgba(0,0,0,0.7)!important; color: white!important; border: 1px solid #555;" value="${extension_settings.stateTracker.tinyLLM?.prompts?.header_state || '[STATE]'}">
                                
                                <label style="font-size: 0.8em;">Header Chat</label>
                                <input type="text" class="text_input" id="st_tiny_p_chat" style="width:100%; margin-bottom:5px; padding:4px; background: rgba(0,0,0,0.7)!important; color: white!important; border: 1px solid #555;" value="${extension_settings.stateTracker.tinyLLM?.prompts?.header_chat || '[CHAT]'}">
                                
                                <label style="font-size: 0.8em;">Instrucción Final (Tail Task)</label>
                                <textarea id="st_tiny_p_task" class="text_input" style="width:100%; height:190px; padding:4px; background: rgba(0,0,0,0.7)!important; color: white!important; border: 1px solid #555;">${extension_settings.stateTracker.tinyLLM?.prompts?.tail_instruction || "[TASK]: You are a logic engine. Analyze the [CHAT] and update the [STATE].\\nRULES:\\n- Output ONLY pure JSON. No markdown, no explanations.\\n- Only include keys that logically changed.\\n{{rule_clothing}}\\n{{rule_biology}}\\n{{rule_groups}}\\n\\nJSON FORMAT EXPECTED:"}</textarea>
                            </div>
                        </div>
                    </div>

                    <!-- 5. Previsualización -->
                    <div style="background: rgba(50,20,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #ffaa00; margin-bottom: 15px; width: 100%;">
                        <label style="font-weight: bold; color: #ffcc55; display:block; margin-bottom: 4px;">5. Previsualización del Prompt Completo</label>
                        <p style="font-size: 0.75em; color: #aaa; margin: 0 0 8px 0;">Pulsa el botón para ver TODO lo que se enviará a la API (Clima, ropa, JSON, etc). Muestra coste de tokens.</p>
                        <button id="st_tiny_btn_refresh_prev" class="menu_button" style="width: 100%; padding: 8px; background: rgba(100,50,0,0.8); border: 1px solid #ffaa00; margin-bottom: 8px; color: white;"><i class="fa-solid fa-arrows-rotate"></i> Cargar / Actualizar Visualización</button>
                        
                        <div id="st_tiny_preview_container" style="display: none; margin-top: 10px;">
                            <div style="font-size: 0.8em; opacity: 0.8; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                                <strong>LO QUE EL LLM VERÁ EXACTAMENTE (TODO):</strong>
                                <span id="st_tiny_token_count" style="background: rgba(0, 150, 136, 0.4); padding: 4px 8px; border-radius: 4px; font-weight: bold; border: 1px solid rgba(0, 150, 136, 0.8); color: white;"><i class="fa-solid fa-coins"></i> Calculando...</span>
                            </div>
                            <label style="font-size: 0.8em; color: #aaddff; margin-bottom: 3px; display:block;"><i class="fa-solid fa-microchip"></i> System Role (Instrucciones Permanentes)</label>
<textarea id="st_tiny_preview_sys" class="text_input" readonly style="width: 100%; height: 110px; padding: 10px; font-family: monospace; font-size: 0.8em; background: rgba(0,0,0,0.9)!important; color: #aaccff!important; border: 1px solid #555; border-radius: 4px; margin-bottom: 10px;"></textarea>

<label style="font-size: 0.8em; color: #aaddff; margin-bottom: 3px; display:block;"><i class="fa-solid fa-user"></i> User Role (Datos de este turno)</label>
<textarea id="st_tiny_preview_usr" class="text_input" readonly style="width: 100%; height: 220px; padding: 10px; font-family: monospace; font-size: 0.8em; background: rgba(0,0,0,0.9)!important; color: #aaccff!important; border: 1px solid #555; border-radius: 4px;"></textarea>
                        </div>
                    </div>
                    
                    <!-- 6. Modo Automático -->
                    <div style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #aa00ff; margin-bottom: 15px; width: 100%;">
                        <label style="cursor: pointer; display: flex; align-items: center; color: white;">
                            <input type="checkbox" id="st_tiny_autoupdate" style="margin-right: 10px; transform: scale(1.3);" ${tinyCfg.autoUpdate ? 'checked' : ''}>
                            <div style="display:flex; flex-direction:column;">
                                <strong>Activar MODO AUTOMÁTICO</strong>
                                <span style="font-size: 0.75em; color: #aaa; margin-top:4px;">Se ejecutará invisiblemente con cada nuevo mensaje del chat. Además, oculta las instrucciones del Main LLM para ahorrarte tokens.</span>
                            </div>
                        </label>
                    </div>

                    <!-- Botones de Acción -->
                    <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                        <button id="st_tiny_btn_send" class="menu_button" style="width: 100%; padding: 15px; background: #005500; font-weight: bold; border-radius: 6px; border: 2px solid #00aa00; color: white; font-size: 1.1em;"><i class="fa-solid fa-bolt"></i> ACTUALIZAR MANUAL AHORA</button>
                        <button id="st_tiny_btn_stop" class="menu_button" style="width: 100%; padding: 15px; background: #900; font-weight: bold; border-radius: 6px; border: 2px solid #ff0000; color: white; font-size: 1.1em; display: none;"><i class="fa-solid fa-stop"></i> PARAR</button>
                    </div>
                </div>
            </div>

            <details style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border: 1px solid #333;">
                <summary style="cursor: pointer; color: #aaa; font-weight: bold;">(Solo Programadores) Ver JSON actual</summary>
                <p style="font-size: 0.75em; color: #777; margin: 5px 0;">Esto es solo el código interno del estado actual. No necesitas tocarlo.</p>
                <pre style="margin-top: 10px; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; border: 1px solid #444; max-height: 20vh; overflow-y: auto; white-space: pre-wrap; font-family: monospace; color: #777;">${formatted}</pre>
            </details>
        </div>
    `;
    
    Popup.show.text(`Gestor de Estado (Turno ${mesId})`, html);

    let saveTimeout;
    function saveTinySettings() {
        tinyCfg.sysprompt = $('#st_tiny_sysprompt').val();
        tinyCfg.ctxCount = parseInt($('#st_tiny_ctx').val()) || 1;
        tinyCfg.profile = $('#st_tiny_profile').val();
        tinyCfg.maxTokens = parseInt($('#st_tiny_maxtokens').val()) || 200;
        tinyCfg.autoUpdate = $('#st_tiny_autoupdate').is(':checked');
        tinyCfg.enabled = $('#st_tiny_master_enabled').is(':checked');
        tinyCfg.prompts = {
            header_context: $('#st_tiny_p_ctx').val(),
            header_state: $('#st_tiny_p_state').val(),
            header_chat: $('#st_tiny_p_chat').val(),
            tail_instruction: $('#st_tiny_p_task').val()
        };
        
        clearTimeout(saveTimeout);
        $('#st_tiny_save_status').show();
        saveTimeout = setTimeout(() => { $('#st_tiny_save_status').fadeOut(500); }, 2000);
        
        const { saveSettingsDebounced } = SillyTavern.getContext();
        if (saveSettingsDebounced) saveSettingsDebounced();
    }
    
    $('#st_tiny_sysprompt, #st_tiny_ctx, #st_tiny_profile, #st_tiny_maxtokens, #st_tiny_autoupdate, #st_tiny_master_enabled, #st_tiny_p_ctx, #st_tiny_p_state, #st_tiny_p_chat, #st_tiny_p_task').on('change input', saveTinySettings);
    
    $('#st_tiny_adv_toggle').on('click', function() {
        $('#st_tiny_adv_container').slideToggle(200);
        const icon = $('#st_tiny_adv_icon');
        icon.toggleClass('fa-caret-right fa-caret-down');
    });
    
    $('#st_tiny_master_enabled').on('change', function() {
        if ($(this).is(':checked')) {
            $('#st_tiny_settings_container').slideDown(200);
        } else {
            $('#st_tiny_settings_container').slideUp(200);
        }
    });

    async function compilePromptLocal() {
        const { buildTinyPrompt } = await import('../core/tinyLLMEngine.js');
        return await buildTinyPrompt(mesId, snapshot);
    }

    async function refreshPreview() {
        const prompt = await compilePromptLocal();
        const sys = $('#st_tiny_sysprompt').val();
        
        $('#st_tiny_preview_sys').val(sys);
        $('#st_tiny_preview_usr').val(prompt);
        $('#st_tiny_preview_container').show();
        $('#st_tiny_token_count').html('<i class="fa-solid fa-spinner fa-spin"></i> Calculando...');
        try {
            const { getTokenCountAsync } = await import('../../../../tokenizers.js');
            const tokenCount = await getTokenCountAsync(sys + "\n" + prompt);
            $('#st_tiny_token_count').html('<i class="fa-solid fa-coins"></i> ~' + tokenCount + ' tokens');
        } catch (e) {
            $('#st_tiny_token_count').html('<i class="fa-solid fa-coins"></i> est: ' + Math.ceil((sys.length + prompt.length) / 4));
        }
    }
    
    $('#st_tiny_btn_refresh_prev').on('click', async function() {
        saveTinySettings();
        await refreshPreview();
    });

    let currentAbortController = null;

    $('#st_tiny_btn_stop').on('click', function() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
    });

    $('#st_tiny_btn_send').on('click', async function() {
        saveTinySettings(); 
        
        const btn = $(this);
        const stopBtn = $('#st_tiny_btn_stop');
        const originalHtml = btn.html();
        
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Conectando...').prop('disabled', true);
        stopBtn.show();
        
        currentAbortController = new AbortController();
        
        try {
            const { executeTinyLLM } = await import('../core/tinyLLMEngine.js');
            const result = await executeTinyLLM(mesId, message, currentAbortController.signal);
            
            if (result.changed > 0 && Object.keys(result.parsedUpdates || {}).length > 0) {
                $('#dialogue_popup_ok').click();
                $('#dialogue_popup_cancel').click();
                if (typeof layer_close === 'function') layer_close('dialogue_popup');
                
                await renderTinyInterceptPanel(result.parsedUpdates, mesId, message.extra.stateTrackerSnapshot, result.text);
            } else if (result.changed === 0) {
                toastr.info("Sin cambios lógicos.", "Tiny LLM");
            }
        } catch (error) {
            if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
                toastr.warning("Generación cancelada por el usuario.", "Tiny LLM");
            } else {
                toastr.error(error.message, "Error Tiny LLM");
            }
        } finally {
            btn.html(originalHtml).prop('disabled', false);
            stopBtn.hide();
            currentAbortController = null;
        }
    });
}

function renderMessageTimeSettings(mesId, message, widgetEl) {
    const { Popup } = SillyTavern.getContext();
    const isTurnZero = String(mesId) === "0";
    
    const originalTs = getTimestamp(message.extra.stateTrackerSnapshot.time);
    let pendingTs = originalTs;
    let pendingWeatherOverride = null;
    
    function getSimulatedText(ts, overrideW) {
        const uiLang = extension_settings.stateTracker?.lang?.ui || 'es';
        const isEn = uiLang === 'en';
        
        const fakeWeather = overrideW ? { type: overrideW, baseTempC: 15 } : message.extra.stateTrackerSnapshot.weather;
        const p = parseTimestamp(ts, fakeWeather, uiLang);
        const context = SillyTavern.getContext();
        const charName = context.characterId !== undefined ? context.characters[context.characterId].name : (context.name2 || 'Jane');
        const userName = context.name1 || 'User';
        
        let text = isEn ? 
            `Month: ${p.monthName} | Day: ${p.date}, ${p.dayName} | Year: ${p.year} | Time: ${p.timeStringVisual} | Phase: ${p.periodName}${p.weatherStringVisual}` :
            `Mes: ${p.monthName} | Día: ${p.date}, ${p.dayName} | Año: ${p.year} | Hora: ${p.timeStringVisual} | Fase: ${p.periodName}${p.weatherStringVisual}`;
        
        const ages = calculateAges(ts);
        if (ages) {
            if (ages.charAge !== null) text += ` | ${charName}_${isEn ? 'age' : 'edad'}: ${ages.charAge}`;
            if (ages.userAge !== null) text += ` | ${userName}_${isEn ? 'age' : 'edad'}: ${ages.userAge}`;
        }
        
        const events = getActiveEvents(ts);
        let evList = [];
        if (ages && ages.isCharBday) evList.push(isEn ? `${charName}'s Birthday` : `Cumpleaños de ${charName}`);
        if (ages && ages.isUserBday) evList.push(isEn ? `${userName}'s Birthday` : `Cumpleaños de ${userName}`);
        events.forEach(e => evList.push(e.name));
        
        if (evList.length > 0) {
            text += isEn ? ` | Event: ${evList.join(', ')}` : ` | Evento: ${evList.join(', ')}`;
        }
        
        return text;
    }
    
    const d = new Date(pendingTs);
    
    let weatherOptionsHtml = '<option value="">-- Sin cambios (Procedural) --</option>';
    for (let key in WEATHER_DICTIONARY) {
        weatherOptionsHtml += `<option value="${key}">${WEATHER_DICTIONARY[key].name}</option>`;
    }
    
    let actionHtml = `
        <style>
            .t0-input-box {
                background: rgba(10, 15, 20, 0.8) !important;
                color: #ffffff !important;
                border: 1px solid rgba(100, 150, 200, 0.4) !important;
                padding: 8px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                border-radius: 6px !important;
                font-size: 1rem !important;
                font-family: monospace !important;
            }
            .t0-label {
                font-size: 0.85em;
                margin-bottom: 4px;
                display: block;
                color: #b0c4de;
                font-weight: bold;
            }
        </style>
        
        <div style="margin-top: 15px;">
            <strong style="font-size: 0.9em; margin-bottom: 8px; display: block;">Retroceder Tiempo</strong>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(65px, 1fr)); gap: 8px; margin-bottom: 10px;">
                <button class="st-text-btn time_mes_btn" data-type="minutes" data-add="-60" style="background: rgba(150,0,0,0.4); padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">-1 Hr</button>
                <button class="st-text-btn time_mes_btn" data-type="days" data-add="-1" style="background: rgba(150,0,0,0.4); padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">-1 Día</button>
                <button class="st-text-btn time_mes_btn" data-type="months" data-add="-1" style="background: rgba(150,0,0,0.4); padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">-1 Mes</button>
                <button class="st-text-btn time_mes_btn" data-type="years" data-add="-1" style="background: rgba(150,0,0,0.4); padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">-1 Año</button>
            </div>
            
            <strong style="font-size: 0.9em; margin-bottom: 8px; display: block;">Avanzar Tiempo</strong>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(65px, 1fr)); gap: 8px; margin-bottom: 15px;">
                <button class="st-text-btn time_mes_btn st-btn-primary" data-type="minutes" data-add="60" style="padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">+1 Hr</button>
                <button class="st-text-btn time_mes_btn st-btn-primary" data-type="minutes" data-add="480" style="padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">+8 Hrs</button>
                <button class="st-text-btn time_mes_btn st-btn-secondary" data-type="days" data-add="1" style="padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">+1 Día</button>
                <button class="st-text-btn time_mes_btn st-btn-secondary" data-type="months" data-add="1" style="padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">+1 Mes</button>
                <button class="st-text-btn time_mes_btn st-btn-secondary" data-type="years" data-add="1" style="padding: 8px 4px; font-size: 0.85em; height: auto; line-height: 1.2;">+1 Año</button>
            </div>
        </div>

        <details style="margin-top: 15px; background: rgba(0,100,200,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,150,255,0.3);">
            <summary style="cursor: pointer; outline: none; user-select: none; display: block;">
                <strong style="font-size: 0.95em; color: #aaccff; display: inline-block; margin-bottom: 5px;">
                    <i class="fa-solid fa-caret-down" style="margin-right: 5px; opacity: 0.7;"></i>Establecer Fecha Absoluta
                </strong>
                ${isTurnZero 
                    ? '<div style="font-size: 0.85em; margin-top: 4px; color: #ffaa55; line-height: 1.4; margin-bottom: 5px;">Al ser el <b>Turno 0</b>, modificar esto desplazará <b>todos los mensajes posteriores</b> para coincidir con la nueva fecha base.</div>'
                    : '<div style="font-size: 0.85em; margin-top: 4px; color: #ddd; line-height: 1.4; margin-bottom: 5px;">Útil para corregir errores. Si este mensaje es viejo, los siguientes mensajes generados usarán esta fecha como base.</div>'
                }
            </summary>
            
            <div style="margin-top: 15px; border-top: 1px solid rgba(0,150,255,0.2); padding-top: 15px;">
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">
                    <div style="flex: 1; min-width: 80px;">
                        <label class="t0-label">Año</label>
                        <input type="number" id="t0_year" class="t0-input-box text_input" value="${d.getUTCFullYear()}">
                    </div>
                    <div style="flex: 1.2; min-width: 100px;">
                        <label class="t0-label">Mes</label>
                        <select id="t0_month" class="t0-input-box text_input" style="padding: 7px !important;">
                            <option value="0" ${d.getUTCMonth()===0?'selected':''}>Ene</option><option value="1" ${d.getUTCMonth()===1?'selected':''}>Feb</option>
                            <option value="2" ${d.getUTCMonth()===2?'selected':''}>Mar</option><option value="3" ${d.getUTCMonth()===3?'selected':''}>Abr</option>
                            <option value="4" ${d.getUTCMonth()===4?'selected':''}>May</option><option value="5" ${d.getUTCMonth()===5?'selected':''}>Jun</option>
                            <option value="6" ${d.getUTCMonth()===6?'selected':''}>Jul</option><option value="7" ${d.getUTCMonth()===7?'selected':''}>Ago</option>
                            <option value="8" ${d.getUTCMonth()===8?'selected':''}>Sep</option><option value="9" ${d.getUTCMonth()===9?'selected':''}>Oct</option>
                            <option value="10" ${d.getUTCMonth()===10?'selected':''}>Nov</option><option value="11" ${d.getUTCMonth()===11?'selected':''}>Dic</option>
                        </select>
                    </div>
                    <div style="flex: 0.8; min-width: 65px;">
                        <label class="t0-label">Día</label>
                        <input type="number" id="t0_day" class="t0-input-box text_input" value="${d.getUTCDate()}" min="1" max="31">
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <div style="flex: 1; min-width: 80px;">
                        <label class="t0-label">Hora (0-23)</label>
                        <input type="number" id="t0_hour" class="t0-input-box text_input" value="${d.getUTCHours()}" min="0" max="23">
                    </div>
                    <div style="flex: 1; min-width: 80px;">
                        <label class="t0-label">Minuto</label>
                        <input type="number" id="t0_min" class="t0-input-box text_input" value="${d.getUTCMinutes()}" min="0" max="59">
                    </div>
                </div>
                <button class="st-text-btn st-btn-secondary" id="time_mes_t0_preview" style="margin-top: 15px; width: 100%; padding: 10px; font-weight: bold; border-radius: 6px;">Cargar a Previsualización</button>
            </div>
        <details style="margin-top: 15px; background: rgba(0,100,200,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,150,255,0.3);">
            <summary style="cursor: pointer; outline: none; user-select: none; display: block;">
                <strong style="font-size: 0.95em; color: #aaccff; display: inline-block; margin-bottom: 5px;">
                    <i class="fa-solid fa-cloud" style="margin-right: 5px; opacity: 0.7;"></i>Forzar Clima Actual
                </strong>
                <div style="font-size: 0.85em; margin-top: 4px; color: #ddd; line-height: 1.4; margin-bottom: 5px;">Sobrescribe temporalmente el motor procedimental para este turno.</div>
            </summary>
            
            <div style="margin-top: 15px; border-top: 1px solid rgba(0,150,255,0.2); padding-top: 15px;">
                <select id="time_mes_weather_override" class="text_input" style="width: 100%; padding: 8px; background: rgba(10,15,20,0.8) !important; color: #ffffff !important; border: 1px solid rgba(100,150,200,0.4) !important; border-radius: 4px;">
                    ${weatherOptionsHtml}
                </select>
                <button class="st-text-btn st-btn-secondary" id="time_mes_w_preview" style="margin-top: 10px; width: 100%; padding: 10px; font-weight: bold; border-radius: 6px;">Previsualizar Clima</button>
            </div>
        </details>
    `;
    
    const html = `
        <div style="max-height: 70vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px;">
            <div style="text-align: center; margin-bottom: 15px;">
                <p style="font-size: 0.9em; opacity: 0.8; line-height: 1.4;">Modificando la línea temporal del <b>Turno ${mesId}</b>.</p>
                <div id="time_mes_preview" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9em; color: #aaccff; margin-top: 10px; word-break: break-word; line-height: 1.4;">
                    ${getSimulatedText(pendingTs, pendingWeatherOverride)}
                </div>
                <div id="time_mes_diff" style="margin-top: 6px; font-weight: bold; font-size: 0.85em; color: #aaa;">Sin cambios</div>
            </div>
            
            <div style="background: rgba(0, 50, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(100, 255, 100, 0.2); margin-top: 15px; display: none;" id="bio_god_container">
                <strong style="font-size: 0.9em; display: block; margin-bottom: 8px; color: #aaffaa;">Simulador Biológico (Ajuste Manual)</strong>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                    <button class="st-text-btn bio_god_btn" data-action="heal_all" style="flex: 1; padding: 6px; background: rgba(50, 200, 50, 0.4); border-radius: 4px; border: 1px solid rgba(100,255,100,0.3); color: white; cursor: pointer; font-size: 0.8em;"><i class="fa-solid fa-heart"></i> Saciar Todo</button>
                    <button class="st-text-btn bio_god_btn" data-action="feed" style="flex: 1; padding: 6px; background: rgba(200, 100, 50, 0.4); border-radius: 4px; border: 1px solid rgba(255,150,100,0.3); color: white; cursor: pointer; font-size: 0.8em;">🍎 Comer/Beber</button>
                    <button class="st-text-btn bio_god_btn" data-action="sleep" style="flex: 1; padding: 6px; background: rgba(50, 100, 200, 0.4); border-radius: 4px; border: 1px solid rgba(100,150,255,0.3); color: white; cursor: pointer; font-size: 0.8em;">💤 Dormir</button>
                </div>
                <div id="bio_sliders_container" style="display: flex; flex-direction: column; gap: 8px; font-size: 0.85em; color: white;">
                    <!-- Sliders injected here -->
                </div>
                <div style="margin-top: 10px; font-size: 0.85em; color: #aaffaa; font-family: monospace; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 4px;">
                    <div style="opacity: 0.7; margin-bottom: 3px;">Prompt a inyectar:</div>
                    <div id="bio_prompt_preview" style="word-break: break-word;"></div>
                </div>
            </div>
            
            <div style="background: rgba(50, 0, 100, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(200, 100, 255, 0.2); margin-top: 15px; display: none;" id="clothing_god_container">
                <strong style="font-size: 0.9em; display: block; margin-bottom: 8px; color: #ddaaff;">Gestión de Armario</strong>
                <div id="clothing_items_container" style="display: flex; flex-wrap: wrap; gap: 5px; font-size: 0.85em;">
                    <!-- Checkboxes injected here -->
                </div>
                <div style="margin-top: 10px; font-size: 0.85em; color: #ddaaff; font-family: monospace; background: rgba(0,0,0,0.5); padding: 6px; border-radius: 4px;">
                    <div style="opacity: 0.7; margin-bottom: 3px;">Prompt a inyectar:</div>
                    <div id="clothing_prompt_preview" style="word-break: break-word;"></div>
                </div>
            </div>
            
            ${actionHtml}

            <div style="display: flex; gap: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; flex-wrap: wrap; margin-top: 15px; margin-bottom: 10px;">
                <button class="st-text-btn" id="time_mes_cancel" style="flex: 1; min-width: 120px; background: #900; color: white; padding: 12px; border-radius: 6px; font-weight: bold; font-size: 0.95em;">Restablecer</button>
                <button class="st-text-btn" id="time_mes_save" style="flex: 1; min-width: 120px; background: #006400; color: white; padding: 12px; border-radius: 6px; font-weight: bold; font-size: 0.95em;">Aplicar cambios</button>
            </div>
        </div>
    `;

    const popupHtml = $(html);
    let popup = null;
    
    function updatePreview() {
        popupHtml.find('#time_mes_preview').text(getSimulatedText(pendingTs, pendingWeatherOverride));
        
        const diff = pendingTs - originalTs;
        const diffEl = popupHtml.find('#time_mes_diff');
        if (diff === 0 && !pendingWeatherOverride) {
            diffEl.text("Sin cambios").css('color', '#aaa');
        } else if (pendingWeatherOverride) {
            diffEl.text("Clima modificado.").css('color', '#55ff55');
        } else if (diff > 0) {
            diffEl.text(`Se adelantará el reloj.`).css('color', '#55ff55');
        } else {
            diffEl.text(`Se retrocederá el reloj.`).css('color', '#ff5555');
        }
    }

    popupHtml.on('click', '.time_mes_btn', function() {
        const type = $(this).data('type');
        const amount = parseInt($(this).data('add'));
        pendingTs = advanceTimeBy(pendingTs, type, amount);
        updatePreview();
    });

    popupHtml.on('click', '#time_mes_t0_preview', function() {
        const y = parseInt(popupHtml.find('#t0_year').val()) || 2024;
        const m = parseInt(popupHtml.find('#t0_month').val()) || 0;
        const d = parseInt(popupHtml.find('#t0_day').val()) || 1;
        const h = parseInt(popupHtml.find('#t0_hour').val()) || 0;
        const min = parseInt(popupHtml.find('#t0_min').val()) || 0;
        pendingTs = Date.UTC(y, m, d, h, min);
        updatePreview();
    });
    
    popupHtml.on('click', '#time_mes_w_preview', function() {
        const w = popupHtml.find('#time_mes_weather_override').val();
        pendingWeatherOverride = w ? w : null;
        updatePreview();
    });

    if (extension_settings.stateTracker.biology_config && extension_settings.stateTracker.biology_config.enabled && message.extra.stateTrackerSnapshot.biology) {
        popupHtml.find('#bio_god_container').show();
        
        const bConfig = extension_settings.stateTracker.biology_config;
        const bio = message.extra.stateTrackerSnapshot.biology;
        let sHtml = '';
        
        const renderSlider = (stat, label, color, invert = false) => {
            let val = bio[stat] || 0;
            let displayVal = invert ? 100 - val : val; // e.g., if hunger is 0, display 100% (full)
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <span style="width: 70px; color: ${color};">${label}</span>
                    <input type="range" class="bio_slider" data-stat="${stat}" data-invert="${invert}" min="0" max="100" value="${displayVal}" style="flex: 1; accent-color: ${color}; cursor: pointer;">
                    <span class="bio_val_txt" data-stat="${stat}" style="width: 40px; text-align: right; color: ${color};">${Math.round(displayVal)}%</span>
                </div>
            `;
        };
        
        if (bConfig.metabolism) {
            sHtml += renderSlider('hunger', 'Saciedad', '#ffaaaa', true);
            sHtml += renderSlider('thirst', 'Hidratac.', '#aaaaff', true);
        }
        if (bConfig.sleep) sHtml += renderSlider('fatigue', 'Energía', '#ffffaa', true);
        if (bConfig.hygiene) sHtml += renderSlider('hygiene', 'Higiene', '#aaffaa'); // Hygiene is 100=clean, 0=dirty. So no invert needed!
        if (bConfig.excretion) {
            sHtml += renderSlider('bladder', 'Vejiga', '#ffaaff', true); // 0 urgency = 100% empty/fine
            sHtml += renderSlider('bowels', 'Intest.', '#ffccaa', true);
        }
        
        popupHtml.find('#bio_sliders_container').html(sHtml);
        
        const updateBioPreview = () => {
            // Reconstruct chatData mock for getBiologyPrompt
            const mockData = { biology: message.extra.stateTrackerSnapshot.biology };
            let promptText = getBiologyPrompt(mockData);
            if (!promptText) {
                promptText = "(Ningún mensaje)";
            } else {
                const context = SillyTavern.getContext();
                const charName = context.characterId !== undefined ? context.characters[context.characterId].name : (context.name2 || 'Jane');
                promptText = promptText.replace(/\{\{char\}\}/g, charName);
            }
            popupHtml.find('#bio_prompt_preview').text(promptText);
        };
        
        updateBioPreview();
        
        // Handle slider dragging
        popupHtml.on('input', '.bio_slider', function() {
            const stat = $(this).data('stat');
            const displayVal = parseFloat($(this).val());
            popupHtml.find(`.bio_val_txt[data-stat="${stat}"]`).text(`${Math.round(displayVal)}%`);
            
            // Live preview update
            const invert = $(this).data('invert');
            const val = invert ? 100 - displayVal : displayVal;
            message.extra.stateTrackerSnapshot.biology[stat] = val;
            updateBioPreview();
        });
        
        // Handle slider release (save state)
        popupHtml.on('change', '.bio_slider', async function() {
            const stat = $(this).data('stat');
            const invert = $(this).data('invert');
            const displayVal = parseFloat($(this).val());
            const val = invert ? 100 - displayVal : displayVal;
            
            const bioData = message.extra.stateTrackerSnapshot.biology;
            bioData[stat] = val;
            
            const context = SillyTavern.getContext();
            if (Number(mesId) === context.chat.length - 1 && extension_settings.stateTracker.chats[context.chatId]?.biology) {
                extension_settings.stateTracker.chats[context.chatId].biology[stat] = val;
            }
            
            const { saveChat, updateMessageBlock } = SillyTavern.getContext();
            if (updateMessageBlock) updateMessageBlock(Number(mesId), message);
            if (saveChat) await saveChat();
            import('./metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
        });
        
        popupHtml.on('click', '.bio_god_btn', async function() {
            const action = $(this).data('action');
            const bio = message.extra.stateTrackerSnapshot.biology;
            const context = SillyTavern.getContext();
            
            const applyBio = (b) => {
                if (action === 'heal_all') {
                    b.hunger = 0; b.thirst = 0; b.fatigue = 0; b.hygiene = 100; b.bladder = 0; b.bowels = 0;
                } else if (action === 'feed') {
                    b.hunger = 0; b.thirst = 0;
                } else if (action === 'sleep') {
                    b.fatigue = 0;
                }
            };
            
            applyBio(bio);
            
            if (Number(mesId) === context.chat.length - 1 && extension_settings.stateTracker.chats[context.chatId]?.biology) {
                applyBio(extension_settings.stateTracker.chats[context.chatId].biology);
            }
            
            // Re-sync sliders
            popupHtml.find('.bio_slider').each(function() {
                const stat = $(this).data('stat');
                const invert = $(this).data('invert');
                const val = bio[stat] || 0;
                const displayVal = invert ? 100 - val : val;
                $(this).val(displayVal);
                popupHtml.find(`.bio_val_txt[data-stat="${stat}"]`).text(`${Math.round(displayVal)}%`);
            });
            updateBioPreview();
            
            toastr.success("Estado biológico restaurado.");
            
            // Re-render widget without saving time yet, just save chat
            const { saveChat, updateMessageBlock } = SillyTavern.getContext();
            if (updateMessageBlock) updateMessageBlock(Number(mesId), message);
            if (saveChat) await saveChat();
            
            import('./metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
        });
    }

    if (extension_settings.stateTracker.clothing_enabled) {
        popupHtml.find('#clothing_god_container').show();
        
        if (!message.extra.stateTrackerSnapshot.clothing) {
            initClothingState(message.extra.stateTrackerSnapshot);
        }
        
        const avatar = getCharacterAvatar();
        const profile = getCharacterProfile(avatar);
        
        if (profile && Object.keys(profile.wardrobe.items).length > 0) {
            let cHtml = '';
            for (let key in profile.wardrobe.items) {
                const item = profile.wardrobe.items[key];
                const isEquipped = message.extra.stateTrackerSnapshot.clothing.equipped.includes(key);
                cHtml += `
                    <label style="display: flex; align-items: center; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; cursor: pointer; border: 1px solid ${isEquipped ? 'rgba(200,100,255,0.6)' : 'rgba(255,255,255,0.1)'};">
                        <input type="checkbox" class="clothing_god_cb" data-id="${key}" ${isEquipped ? 'checked' : ''} style="margin-right: 5px;">
                        ${item.name}
                    </label>
                `;
            }
            popupHtml.find('#clothing_items_container').html(cHtml);
        } else {
            popupHtml.find('#clothing_items_container').html('<div style="opacity: 0.6;">No hay prendas en el armario.</div>');
        }
        
        const updateClothingPreview = () => {
            const context = SillyTavern.getContext();
            const charName = context.characterId !== undefined ? context.characters[context.characterId].name : (context.name2 || 'Jane');
            const mockData = { clothing: message.extra.stateTrackerSnapshot.clothing };
            let promptText = getClothingPrompt(mockData, charName, avatar);
            if (!promptText) promptText = "(Ningún mensaje)";
            popupHtml.find('#clothing_prompt_preview').text(promptText);
        };
        
        updateClothingPreview();
        
        popupHtml.on('change', '.clothing_god_cb', async function() {
            const itemId = $(this).data('id');
            const isChecked = $(this).prop('checked');
            
            $(this).parent().css('border', isChecked ? '1px solid rgba(200,100,255,0.6)' : '1px solid rgba(255,255,255,0.1)');
            
            let equipped = message.extra.stateTrackerSnapshot.clothing.equipped;
            if (isChecked && !equipped.includes(itemId)) {
                equipped.push(itemId);
            } else if (!isChecked && equipped.includes(itemId)) {
                equipped = equipped.filter(id => id !== itemId);
                message.extra.stateTrackerSnapshot.clothing.equipped = equipped;
            }
            
            const context = SillyTavern.getContext();
            if (Number(mesId) === context.chat.length - 1 && extension_settings.stateTracker.chats[context.chatId]?.clothing) {
                extension_settings.stateTracker.chats[context.chatId].clothing.equipped = [...equipped];
            }
            
            updateClothingPreview();
            
            const { saveChat, updateMessageBlock } = SillyTavern.getContext();
            if (updateMessageBlock) updateMessageBlock(Number(mesId), message);
            if (saveChat) await saveChat();
            import('./metadataViewer.js').then(module => { if (module.refreshAllWidgets) module.refreshAllWidgets(); });
        });
    }

    popupHtml.on('click', '#time_mes_save', async function() {
        let changed = false;
        const context = SillyTavern.getContext();
        
        if (pendingTs !== originalTs) {
            changed = true;
            const diffMs = pendingTs - originalTs;
            
            if (!message.extra.stateTrackerSnapshot.time) {
                message.extra.stateTrackerSnapshot.time = {};
            }
            message.extra.stateTrackerSnapshot.time.timestamp = pendingTs;
            delete message.extra.stateTrackerSnapshot.time.minutes;
            
            // If it's turn 0, shift ALL subsequent messages
            if (isTurnZero && diffMs !== 0 && context.chat) {
                for (let i = 1; i < context.chat.length; i++) {
                    const nextMsg = context.chat[i];
                    if (nextMsg && nextMsg.extra && nextMsg.extra.stateTrackerSnapshot && nextMsg.extra.stateTrackerSnapshot.time) {
                        const oldTs = getTimestamp(nextMsg.extra.stateTrackerSnapshot.time);
                        nextMsg.extra.stateTrackerSnapshot.time.timestamp = oldTs + diffMs;
                        delete nextMsg.extra.stateTrackerSnapshot.time.minutes;
                    }
                }
                
                // Also update the global saved state for this chat to reflect the shifted time
                if (context.chatId && extension_settings.stateTracker.chats[context.chatId]) {
                    const globalTime = extension_settings.stateTracker.chats[context.chatId].time;
                    if (globalTime) {
                        globalTime.timestamp = getTimestamp(globalTime) + diffMs;
                        delete globalTime.minutes;
                    }
                }
            }
        }
        
        if (pendingWeatherOverride) {
            changed = true;
            message.extra.stateTrackerSnapshot.weather = generateWeather(pendingTs, pendingWeatherOverride);
        }
        
        if (changed) {
            refreshAllWidgets();
            const { saveChat } = SillyTavern.getContext();
            if (saveChat) await saveChat();
            toastr.success("Línea temporal actualizada", "State Tracker");
        }
        if (popup) popup.dlg.find('.popup-controls .menu_button').click();
    });

    popupHtml.on('click', '#time_mes_cancel', function() {
        if (popup) popup.dlg.find('.popup-controls .menu_button').click();
    });

    popup = new Popup(popupHtml, 'text', null, { okButton: "Cerrar sin guardar" });
    popup.show();
}

export function refreshAllWidgets() {
    const context = SillyTavern.getContext();
    if (!context || !context.chat) return;

    const enabled = extension_settings.stateTracker?.enableTimeEngine !== false;

    $('.mes').each(function() {
        const mesEl = $(this);
        const mesId = mesEl.attr('mesid');
        if (mesId == null) return;
        
        const message = context.chat[mesId];
        if (!message || !message.extra || !message.extra.stateTrackerSnapshot) return;

        // Microchip Button
        if (mesEl.find('.state-meta-btn').length === 0) {
            const btn = $(`
                <div class="mes_button state-meta-btn" title="View State Snapshot" style="cursor: pointer; opacity: 0.6; display: inline-block; margin-left: 5px;">
                    <i class="fa-solid fa-microchip"></i>
                </div>
            `);
            btn.on('click', (e) => {
                e.stopPropagation();
                renderSnapshotModal(mesId, message);
            });
            const btnContainer = mesEl.find('.mes_buttons');
            if (btnContainer.length > 0) {
                btnContainer.prepend(btn);
            }
        }

        // Time Widget
        const existingWidget = mesEl.find('.time-context-widget');
        
        if (!enabled || !message.extra.stateTrackerSnapshot.time) {
            if (existingWidget.length > 0) existingWidget.remove();
            return;
        }

        const uiLang = extension_settings.stateTracker?.lang?.ui || 'es';
        const isEn = uiLang === 'en';
        
        const timestamp = getTimestamp(message.extra.stateTrackerSnapshot.time);
        const parsed = parseTimestamp(timestamp, message.extra.stateTrackerSnapshot.weather, uiLang);
        
        const charName = context.characterId !== undefined ? context.characters[context.characterId].name : (context.name2 || 'Jane');
        const userName = context.name1 || 'User';
        let newText = isEn ?
            `Month: ${parsed.monthName} | Day: ${parsed.date}, ${parsed.dayName} | Year: ${parsed.year} | Time: ${parsed.timeStringVisual} | Phase: ${parsed.periodName}${parsed.weatherStringVisual}` :
            `Mes: ${parsed.monthName} | Día: ${parsed.date}, ${parsed.dayName} | Año: ${parsed.year} | Hora: ${parsed.timeStringVisual} | Fase: ${parsed.periodName}${parsed.weatherStringVisual}`;
        
        const ages = calculateAges(timestamp);
        if (ages) {
            if (ages.charAge !== null) newText += ` | ${charName}_${isEn ? 'age' : 'edad'}: ${ages.charAge}`;
            if (ages.userAge !== null) newText += ` | ${userName}_${isEn ? 'age' : 'edad'}: ${ages.userAge}`;
        }
        
        const events = getActiveEvents(timestamp);
        let evList = [];
        if (ages && ages.isCharBday) evList.push(isEn ? `${charName}'s Birthday` : `Cumpleaños de ${charName}`);
        if (ages && ages.isUserBday) evList.push(isEn ? `${userName}'s Birthday` : `Cumpleaños de ${userName}`);
        events.forEach(e => evList.push(e.name));
        
        if (evList.length > 0) {
            newText += isEn ? ` | Event: ${evList.join(', ')}` : ` | Evento: ${evList.join(', ')}`;
        }
        
        if (existingWidget.length === 0) {
            const timeWidget = $(`
                <div class="time-context-widget" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(30, 40, 50, 0.4); border: 1px solid rgba(100, 150, 200, 0.3); border-radius: 6px; padding: 4px 8px; margin-bottom: 8px; font-size: 0.85em; font-family: monospace; color: #aaccff; word-break: break-word;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; flex: 1;">
                        <span class="time-widget-text" style="line-height: 1.4;">${newText}</span>
                    </div>
                    <div class="time-widget-settings" title="Ajustar Motor" style="cursor: pointer; opacity: 1; padding: 8px 12px; margin: -4px -8px; color: white; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-gear"></i>
                    </div>
                </div>
            `);

            timeWidget.find('.time-widget-settings').on('click', (e) => {
                e.stopPropagation();
                renderMessageTimeSettings(mesId, message, timeWidget);
            });

            const textContainer = mesEl.find('.mes_text');
            if (textContainer.length > 0) {
                textContainer.before(timeWidget);
            }
        } else {
            const textEl = existingWidget.find('.time-widget-text');
            if (textEl.text() !== newText) {
                textEl.text(newText);
            }
        }
        
        // Render Biology Widget
        const existingBioWidget = mesEl.find('.bio-context-widget');
        if (extension_settings.stateTracker.biology_config && extension_settings.stateTracker.biology_config.enabled && message.extra.stateTrackerSnapshot.biology) {
            const bio = message.extra.stateTrackerSnapshot.biology;
            const bConfig = extension_settings.stateTracker.biology_config;
            
            let bioText = `${charName} | `;
            let icons = [];
            
            if (bConfig.metabolism) {
                icons.push(`🍎 ${Math.round(100 - bio.hunger)}%`);
                icons.push(`💧 ${Math.round(100 - bio.thirst)}%`);
            }
            if (bConfig.sleep) {
                icons.push(`💤 ${Math.round(100 - bio.fatigue)}%`);
            }
            if (bConfig.hygiene) {
                icons.push(`🛁 ${Math.round(bio.hygiene)}%`);
            }
            if (bConfig.excretion) {
                icons.push(`🚽 ${Math.round(bio.bladder)}% / ${Math.round(bio.bowels)}%`);
            }
            if (bConfig.pregnancy && bio.is_pregnant) {
                icons.push(`🤰 Día ${Math.floor(bio.pregnancy_days)}`);
            }
            
            bioText += icons.join(' | ');
            
            if (existingBioWidget.length === 0) {
                const bioWidget = $(`
                    <div class="bio-context-widget" style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; background: rgba(0, 50, 0, 0.3); border: 1px solid rgba(100, 255, 100, 0.2); border-radius: 6px; padding: 4px 8px; margin-bottom: 8px; font-size: 0.85em; font-family: monospace; color: #aaffaa; word-break: break-word;">
                        <span class="bio-widget-text" style="line-height: 1.4;">${bioText}</span>
                    </div>
                `);
                
                const timeWidg = mesEl.find('.time-context-widget');
                if (timeWidg.length > 0) {
                    timeWidg.after(bioWidget);
                } else {
                    const textContainer = mesEl.find('.mes_text');
                    if (textContainer.length > 0) textContainer.before(bioWidget);
                }
            } else {
                existingBioWidget.find('.bio-widget-text').text(bioText);
            }
        } else {
            if (existingBioWidget.length > 0) existingBioWidget.remove();
        }
        
        // Render Clothing Widget
        const existingClothingWidget = mesEl.find('.clothing-context-widget');
        if (extension_settings.stateTracker.clothing_enabled && message.extra.stateTrackerSnapshot.clothing) {
            const equippedIds = message.extra.stateTrackerSnapshot.clothing.equipped;
            const profile = getCharacterProfile(getCharacterAvatar());
            let cText = `${charName} | `;
            
            if (profile && equippedIds.length > 0) {
                const names = equippedIds.map(id => profile.wardrobe.items[id]?.name || id);
                cText += `👔 ${names.join(', ')}`;
            } else {
                cText += `👔 (Desnuda/o)`;
            }
            
            if (existingClothingWidget.length === 0) {
                const clothingWidget = $(`
                    <div class="clothing-context-widget" style="display: flex; align-items: center; justify-content: flex-start; gap: 8px; background: rgba(50, 0, 100, 0.3); border: 1px solid rgba(200, 100, 255, 0.2); border-radius: 6px; padding: 4px 8px; margin-bottom: 8px; font-size: 0.85em; font-family: monospace; color: #ddaaff; word-break: break-word;">
                        <span class="clothing-widget-text" style="line-height: 1.4;">${cText}</span>
                    </div>
                `);
                
                const bioWidg = mesEl.find('.bio-context-widget');
                if (bioWidg.length > 0) {
                    bioWidg.after(clothingWidget);
                } else {
                    const timeWidg = mesEl.find('.time-context-widget');
                    if (timeWidg.length > 0) {
                        timeWidg.after(clothingWidget);
                    } else {
                        const textContainer = mesEl.find('.mes_text');
                        if (textContainer.length > 0) textContainer.before(clothingWidget);
                    }
                }
            } else {
                existingClothingWidget.find('.clothing-widget-text').text(cText);
            }
        } else {
            if (existingClothingWidget.length > 0) existingClothingWidget.remove();
        }

    });
}


export async function renderTinyInterceptPanel(updates, mesId, snapshot, rawText = "") {
    if (!updates || Object.keys(updates).length === 0) return;
    
    // Si la UI de SillyTavern existe, mostramos panel. Si no, aplicamos? Mejor siempre mostrar panel.
    $('.st-tiny-intercept').remove();
    
    let htmlLines = '';
    for (const [key, val] of Object.entries(updates)) {
        htmlLines += `
        <div style="display:flex; align-items:center; margin-bottom:4px; font-size: 0.9em;">
            <input type="checkbox" class="st-tiny-cb" data-key="${key.replace(/"/g, '&quot;')}" data-val="${String(val).replace(/"/g, '&quot;')}" checked style="margin-right:8px; transform: scale(1.2);">
            <strong>${key}</strong>: <span>${val}</span>
        </div>`;
    }
    
    const panelId = 'st-tiny-intercept-' + mesId;
    const panelHtml = `
    <div id="${panelId}" class="st-tiny-intercept" style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); width: 92%; max-width: 400px; z-index: 99999; background: var(--SmartThemeBlurTintColor, rgba(15,30,15,0.95)); border: 2px solid #00aa00; padding: 15px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.9); backdrop-filter: blur(8px);">
        <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 1.1em; text-align: center; color: #55ff55;"><i class="fa-solid fa-microchip"></i> Cambios Propuestos (Tiny LLM)</h4>
        <div style="margin-bottom: 15px; max-height: 180px; overflow-y: auto; text-align: left; padding: 5px; background: rgba(0,0,0,0.5); border-radius: 4px;">${htmlLines}</div>
        <div style="display: flex; gap: 8px;">
            <button id="btn-tiny-acc-${mesId}" class="menu_button" style="flex: 1; margin: 0; padding: 10px; background: #006400; font-weight: bold; font-size: 0.95em;">Aplicar Selección</button>
            <button id="btn-tiny-rej-${mesId}" class="menu_button" style="flex: 1; margin: 0; padding: 10px; background: #900; font-weight: bold; font-size: 0.95em;">Descartar Todo</button>
        </div>
        ${rawText ? `<div style="margin-top: 10px; text-align: center;">
            <button id="btn-tiny-raw-${mesId}" style="background: none; border: 1px solid #555; color: #aaa; cursor: pointer; border-radius: 4px; padding: 4px 8px; font-size: 0.8em;"><i class="fa-solid fa-bug"></i> (Solo Debug) Ver Respuesta Cruda</button>
            <textarea id="st-tiny-raw-area-${mesId}" readonly style="display: none; width: 100%; height: 120px; margin-top: 8px; background: rgba(0,0,0,0.8); border: 1px solid #444; color: #aaccff; font-family: monospace; font-size: 0.8em; padding: 6px;"></textarea>
        </div>` : ''}
    </div>`;
    
    $('body').append(panelHtml);
    
    if (rawText) {
        $(`#btn-tiny-raw-${mesId}`).on('click', function() {
            const area = $(`#st-tiny-raw-area-${mesId}`);
            if (area.is(':visible')) {
                area.hide();
            } else {
                area.val(rawText).show();
            }
        });
    }

    $(`#btn-tiny-acc-${mesId}`).on('click', async function() {
        const filteredUpdates = {};
        $(`#${panelId} .st-tiny-cb:checked`).each(function() {
            const k = $(this).attr('data-key');
            let v = $(this).attr('data-val');
            // Try parse number or array if needed, but for simplicity:
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            else if (!isNaN(v) && v.trim() !== '') v = Number(v);
            else if (v.startsWith('[') && v.endsWith(']')) {
                try { v = JSON.parse(v); } catch(e){}
            }
            filteredUpdates[k] = v;
        });
        
        const { applyTinyUpdates } = await import('../core/tinyLLMEngine.js');
        const changes = await applyTinyUpdates(filteredUpdates, mesId, snapshot);
        toastr.success(`Tiny LLM aplicó ${changes} variables.`, "StateTracker");
        $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
    });
    
    $(`#btn-tiny-rej-${mesId}`).on('click', function() {
        $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
    });
}