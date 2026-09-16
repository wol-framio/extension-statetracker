import { extension_settings } from '../../../../extensions.js';
import { getTokenCountAsync } from '../../../../tokenizers.js';
import { getTimestamp, parseTimestamp, advanceTimeBy, DEFAULT_EPOCH } from '../core/timeEngine.js';
import { WEATHER_DICTIONARY, generateWeather } from '../core/weatherEngine.js';
import { calculateAges, getActiveEvents } from '../core/calendarEngine.js';
import { getBiologyPrompt } from '../core/biologyEngine.js';
import { getClothingPrompt, getCharacterProfile, initClothingState } from '../core/clothingEngine.js';
import { getCharacterAvatar } from '../core/stateManager.js';
async function renderSnapshotModal(mesId, message) {
    const { Popup } = SillyTavern.getContext();
    const snapshot = message.extra.stateTrackerSnapshot;
    
    // Format JSON safely and filter out internal config/CSS
    let cleanSnapshot = {};
    let formatted = "";
    try {
        if (snapshot && snapshot.groups) {
            snapshot.groups.forEach(group => {
                cleanSnapshot[group.name] = group.variables;
            });
            if (snapshot.time) cleanSnapshot.time = snapshot.time;
            if (snapshot.weather) cleanSnapshot.weather = snapshot.weather;
            if (snapshot.calendar) cleanSnapshot.calendar = snapshot.calendar;
        } else {
            cleanSnapshot = snapshot;
        }
        formatted = JSON.stringify(cleanSnapshot, null, 2);
    } catch (e) {
        formatted = "Error parsing snapshot data.";
    }

    let tokenCount = 0;
    try {
        tokenCount = await getTokenCountAsync(formatted);
    } catch (err) {
        tokenCount = Math.ceil(formatted.length / 4);
    }

    const html = `
        <div style="text-align: left; font-size: 0.9em; margin-top: 10px;">
            <div style="margin-bottom: 10px; color: #aaa; display: flex; justify-content: space-between; align-items: center;">
                <span>This is the exact logical state frozen in time at this specific message turn.</span>
                <span style="background: rgba(0, 150, 136, 0.25); padding: 4px 8px; border-radius: 6px; font-weight: bold; border: 1px solid rgba(0, 150, 136, 0.5);" title="Approximate token consumption of this metadata.">
                    <i class="fa-solid fa-coins"></i> ~${tokenCount} tokens
                </span>
            </div>
            <pre style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; border: 1px solid #444; max-height: 50vh; overflow-y: auto; white-space: pre-wrap; font-family: monospace;">${formatted}</pre>
        </div>
    `;
    Popup.show.text(`State Snapshot (Turn ${mesId})`, html);
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
