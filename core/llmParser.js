import { getCharacterData, getCharacterAvatar, findDatabaseKey, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';
import { snapshotStateToMessage } from './persistenceManager.js';
import { formatTimePrompt, advanceTime } from './timeEngine.js';
import { getBiologyPrompt, getBiologyLLMInstructions, processBiologyEvents } from './biologyEngine.js';
import { getClothingPrompt, getClothingLLMInstructions, processClothingEvents } from './clothingEngine.js';

export function buildStatePrompt() {
    const data = getCharacterData();
    if (!data || !data.groups || data.groups.length === 0) return '';

    const context = SillyTavern.getContext();
    const charName = context.characterId !== undefined ? context.characters[context.characterId].name : 'Jane';
    const userName = context.userName || 'Yasuo';

    let prompt = `\n\n[CURRENT STATE & ENVIRONMENT VARIABLES]\n`;
    prompt += formatTimePrompt();
    
    let hasVars = false;

    data.groups.forEach(group => {
        if (group.hidden) return; // Skip hidden groups

        const keys = Object.keys(group.variables);
        if (keys.length > 0) {
            hasVars = true;
            keys.forEach(key => {
                const resolvedKey = key.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName);
                let instructionStr = (group.instructions && group.instructions[key]) ? ` [Constraint: ${group.instructions[key]}]` : '';
                if (group.locked || (group.locks && group.locks[key])) {
                    instructionStr += ' [LOCKED: DO NOT UPDATE]';
                }
                prompt += `- ${resolvedKey}: ${group.variables[key]}${instructionStr}\n`;
            });
        }
    });

    if (!hasVars) return '';

    let instructions = extension_settings.stateTracker.customPrompt;
    if (!instructions || instructions.trim() === "") {
        instructions = `To update any variable when the scene, time, clothes, positions, money, or state changes, you MUST append a tag at the very end of your response:\n` +
        `[UPDATE_STATE: key_name=value | another_key=value2]\n` +
        `Example: [UPDATE_STATE: location_room=Kitchen | chronos_time=08:00 | {{char}}_position=Standing]. Update only the keys that changed. Unchanged keys preserve their values. You are allowed to update as many keys as necessary, there is no limit.`;
    }

    prompt += `\n${instructions}\n`;
    
    // Inyectar estado físico biológico de forma natural si existe
    const bioPrompt = getBiologyPrompt(data);
    if (bioPrompt) prompt += `\n${bioPrompt}`;
    
    const avatar = getCharacterAvatar();
    const clothingPrompt = getClothingPrompt(data, charName, avatar);
    if (clothingPrompt) prompt += `\n${clothingPrompt}`;
    
    // Inyectar instrucciones de etiquetas de supervivencia y ropa al final
    const bioInst = getBiologyLLMInstructions();
    if (bioInst) prompt += `\n${bioInst}`;
    
    const clothingInst = getClothingLLMInstructions();
    if (clothingInst) prompt += `\n${clothingInst}\n`;
    
    return prompt;
}

export function onGenerateBeforeCombinePrompts(data) {
    if (!extension_settings.stateTracker.enabled) return;
    const prompt = buildStatePrompt();
    if (prompt) data.main = data.main + prompt;
}

export function onChatCompletionPromptReady(eventData) {
    if (!extension_settings.stateTracker.enabled) return;
    const prompt = buildStatePrompt();
    if (!prompt) return;

    let systemMessage = eventData.chat.find(msg => msg.role === 'system');
    if (systemMessage) {
        systemMessage.content = systemMessage.content + prompt;
    } else {
        eventData.chat.unshift({ role: 'system', content: prompt });
    }
}

export async function onMessageSent(messageId) {
    if (!extension_settings.stateTracker.enabled) return;

    // MESSAGE_SENT solo se emite tras insertar el mensaje del usuario en chat,
    // pasando su índice (script.js:5858). Snapshottear aquí muestra la hora en
    // el turno del usuario y captura el estado antes de que el LLM responda.
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageId] || !chat[messageId].is_user) return;

    // Tiempo determinístico para este turno del usuario.
    const recordTs = advanceTime(5, messageId);
    if (recordTs === undefined) return;

    await snapshotStateToMessage(messageId, recordTs);

    // Adelantar el reloj al instante que registrará el siguiente turno, de modo
    // que el LLM perciba durante la generación la hora que su mensaje grabará.
    getCharacterData().time.timestamp = recordTs + (5 * 60000);
    saveAndUpdateHUD();
}

export async function onMessageReceived(messageId) {
    if (!extension_settings.stateTracker.enabled) return;

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageId]) return;

    const message = chat[messageId];
    if (message.is_user) {
        return;
    }

    // El turno del LLM tambien consume tiempo: cada mensaje (turno) suma 5
    // minutos, de modo que del turno 0 al turno 2 hayan transcurrido 10.
    // El tiempo es determinístico por índice de mensaje, así que regenerar
    // (swipe) este mismo turno vuelve SIEMPRE al mismo instante y no infla.
    const recordTs = advanceTime(5, messageId);

    const data = getCharacterData();
    let text = message.mes;
    let changed = false;
    
    // Parse biology tags silently
    const bioResult = processBiologyEvents(text, data);
    if (bioResult.changed) {
        text = bioResult.cleanText;
        changed = true;
    }
    
    const contextStr = SillyTavern.getContext();
    const charName = contextStr.characterId !== undefined ? contextStr.characters[contextStr.characterId].name : 'Jane';
    const avatar = getCharacterAvatar();
    
    const clothResult = processClothingEvents(text, data, charName, avatar);
    if (clothResult.changed) {
        text = clothResult.cleanText;
        changed = true;
    }
    
    if (changed) {
        message.mes = text;
        const { updateMessageBlock } = SillyTavern.getContext();
        if (updateMessageBlock) updateMessageBlock(Number(messageId), message);
    }
    
    const stateRegex = /\[UPDATE_STATE:\s*([^\]]+)\]/i;
    const match = stateRegex.exec(text);

    if (match) {
        const data = getCharacterData();
        const { Popup, updateMessageBlock, saveChat } = SillyTavern.getContext();
        
        if (data && data.groups) {
            const commandString = match[1];
            const pairs = commandString.split('|');
            let proposedChanges = [];

            pairs.forEach(pair => {
                const parts = pair.split('=');
                if (parts.length === 2) {
                    const llmKey = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
                    const value = parts[1].trim();

                    const matchKey = findDatabaseKey(llmKey, data.groups);
                    if (matchKey) {
                        // Verificar si el grupo o la variable están bloqueados
                        const isGroupLocked = matchKey.group.locked;
                        const isVarLocked = matchKey.group.locks && matchKey.group.locks[matchKey.key];
                        
                        if (!isGroupLocked && !isVarLocked) {
                            proposedChanges.push({ group: matchKey.group, key: matchKey.key, value: value });
                        }
                    }
                }
            });

            // Strip the tag from the message IMMEDIATELY to keep chat clean
            const cleanText = text.replace(/\[UPDATE_STATE:\s*[^\]]+\]/gi, '').trim();
            message.mes = cleanText;
            if (updateMessageBlock) updateMessageBlock(Number(messageId), message);

            if (proposedChanges.length > 0) {
                let changeLog = proposedChanges.map(c => `- <b>${c.key}</b>: ${c.value}`).join('<br>');
                
                // Remove previous panels to avoid stacking
                $('.state-confirm-panel').remove();

                const panelId = `state-confirm-${messageId}`;
                const panelHtml = `
                <div id="${panelId}" class="state-confirm-panel" style="position: fixed; top: 60px; left: 50%; transform: translateX(-50%); width: 92%; max-width: 400px; z-index: 99999; background: var(--SmartThemeBlurTintColor, rgba(20,20,20,0.95)); border: 1px solid var(--SmartThemeBorderColor, #555); padding: 12px; border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.8); backdrop-filter: blur(8px);">
                    <h4 style="margin-top: 0; margin-bottom: 8px; font-size: 1.05em; text-align: center;">State Updates Proposed</h4>
                    <div style="font-size: 0.85em; margin-bottom: 12px; max-height: 120px; overflow-y: auto; text-align: left;">${changeLog}</div>
                    <div style="display: flex; gap: 8px;">
                        <button id="btn-acc-${messageId}" class="menu_button" style="flex: 1; margin: 0; padding: 8px; background: #006400; font-weight: bold; font-size: 0.9em;">Accept</button>
                        <button id="btn-rej-${messageId}" class="menu_button" style="flex: 1; margin: 0; padding: 8px; background: #900; font-weight: bold; font-size: 0.9em;">Reject</button>
                    </div>
                </div>
                `;
                $('body').append(panelHtml);

                $(`#btn-acc-${messageId}`).on('click', async function() {
                    proposedChanges.forEach(c => {
                        c.group.variables[c.key] = c.value;
                    });
                    saveAndUpdateHUD();
                    await snapshotStateToMessage(messageId, recordTs);
                    toastr.success(`State updated successfully.`, "State Tracker");
                    if (saveChat) await saveChat();
                    $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
                });

                $(`#btn-rej-${messageId}`).on('click', async function() {
                    await snapshotStateToMessage(messageId, recordTs);
                    toastr.warning(`State updates rejected.`, "State Tracker");
                    $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
                });
            } else {
                await snapshotStateToMessage(messageId, recordTs);
                if (saveChat) await saveChat();
            }
        } else {
            await snapshotStateToMessage(messageId, recordTs);
        }
    } else {
        await snapshotStateToMessage(messageId, recordTs);
    }

    // Adelantar el reloj al instante que registrará el siguiente turno con
    // independencia de cuándo se acepte/rechace el [UPDATE_STATE] pendiente.
    if (recordTs !== undefined) {
        getCharacterData().time.timestamp = recordTs + (5 * 60000);
        saveAndUpdateHUD();
    }
}
