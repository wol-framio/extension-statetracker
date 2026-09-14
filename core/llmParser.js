import { getCharacterData, findDatabaseKey, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';
import { snapshotStateToMessage } from './persistenceManager.js';

export function buildStatePrompt() {
    const data = getCharacterData();
    if (!data || !data.groups || data.groups.length === 0) return '';

    const context = SillyTavern.getContext();
    const charName = context.characterId !== undefined ? context.characters[context.characterId].name : 'Jane';
    const userName = context.userName || 'Yasuo';

    let prompt = `\n\n[CURRENT STATE & ENVIRONMENT VARIABLES]\n`;
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

export async function onMessageReceived(messageId) {
    if (!extension_settings.stateTracker.enabled) return;

    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !chat[messageId]) return;

    const message = chat[messageId];
    if (message.is_user) return;

    const text = message.mes;
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
                    await snapshotStateToMessage(messageId);
                    toastr.success(`State updated successfully.`, "State Tracker");
                    if (saveChat) await saveChat();
                    $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
                });

                $(`#btn-rej-${messageId}`).on('click', async function() {
                    await snapshotStateToMessage(messageId);
                    toastr.warning(`State updates rejected.`, "State Tracker");
                    $(`#${panelId}`).fadeOut(200, function() { $(this).remove(); });
                });
            } else {
                await snapshotStateToMessage(messageId);
                if (saveChat) await saveChat();
            }
        } else {
            await snapshotStateToMessage(messageId);
        }
    } else {
        await snapshotStateToMessage(messageId);
    }
}
