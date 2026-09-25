import { extension_settings } from '../../../../extensions.js';
import { ConnectionManagerRequestService } from '../../../shared.js';
import { generateRaw } from '../../../../../script.js';

export async function buildTinyPrompt(mesId, snapshot) {
    const context = SillyTavern.getContext();
    const { getCharacterData } = await import('./stateManager.js');
    const { getClothingPrompt } = await import('./clothingEngine.js');
    const { getBiologyPrompt } = await import('./biologyEngine.js');
    const { parseTimestamp } = await import('./timeEngine.js');
    
    const liveData = getCharacterData() || { groups: [] };
    const charName = context.characters[context.characterId]?.name || 'Char';
    const avatar = context.characters[context.characterId]?.avatar || '';
    const userName = context.userName || 'User';

    const tinyCfg = extension_settings.stateTracker.tinyLLM || {};
    const prompts = tinyCfg.prompts || {};
    const hContext = prompts.header_context || '[Context]';
    const hState = prompts.header_state || '[STATE]';
    const hChat = prompts.header_chat || '[CHAT]';
    
    // Auto-migrate old short prompt
    if (prompts.tail_instruction && (prompts.tail_instruction.includes('[TASK]: Extract logical changes') || prompts.tail_instruction.includes('[TAREA]: Extrae cambios') || prompts.tail_instruction.includes("Use 'biology_[stat]' with numeric values") || prompts.tail_instruction.includes("3. CLOTHING:"))) {
        prompts.tail_instruction = "[TASK]: You are a logic engine. Analyze the [CHAT] and update the [STATE].\nRULES:\n- Output ONLY pure JSON. No markdown, no explanations.\n- Only include keys that logically changed.\n{{rule_clothing}}\n{{rule_biology}}\n{{rule_groups}}\n\nJSON FORMAT EXPECTED:";
    }
    const hTask = prompts.tail_instruction || "[TASK]: You are a logic engine. Analyze the [CHAT] and update the [STATE].\nRULES:\n- Output ONLY pure JSON. No markdown, no explanations.\n- Only include keys that logically changed.\n{{rule_clothing}}\n{{rule_biology}}\n{{rule_groups}}\n\nJSON FORMAT EXPECTED:";

    // 1. Chat History (MainLLM messages)
    const ctxCount = tinyCfg.ctxCount || 1;
    const targetMesId = parseInt(mesId);
    let chatHist = `${hChat}\n`;
    for (let i = targetMesId - ctxCount + 1; i <= targetMesId; i++) {
        if (i < 0) continue;
        const m = context.chat[i];
        if (m) {
            const name = m.is_user ? (context.name1 || 'User') : (context.characters[context.characterId]?.name || 'Char');
            chatHist += `[${name}]: ${m.mes}\n\n`;
        }
    }

    let clothStr = "";
    let bioStr = "";
    let groupStr = "";

    if (snapshot) {
        // 2. Clothing System
        if (extension_settings.stateTracker.clothing_enabled) {
            if (!snapshot.clothing) snapshot.clothing = { equipped: [] };
            const clothPrompt = getClothingPrompt(snapshot, charName, avatar);
            if (clothPrompt) clothStr = clothPrompt + "\n";
        }
        
        // 3. Biological Functions
        if (extension_settings.stateTracker.biology_config?.enabled) {
            if (!snapshot.biology) snapshot.biology = { hunger: 0, thirst: 0, fatigue: 0, hygiene: 100, bladder: 0, bowels: 0, is_pregnant: false, pregnancy_days: 0 };
            const bioPrompt = getBiologyPrompt(snapshot);
            if (bioPrompt) bioStr = bioPrompt + "\n";
        }

        // 4. Contextual State (Groups)
        if (snapshot.groups) {
            snapshot.groups.forEach(snapGroup => {
                const liveGroup = liveData.groups.find(g => g.name === snapGroup.name);
                if ((liveGroup && liveGroup.hidden) || snapGroup.hidden) return; 
                
                const keys = Object.keys(snapGroup.variables);
                if (keys.length > 0) {
                    let groupVars = [];
                    keys.forEach(key => { 
                        const val = snapGroup.variables[key];
                        const resolvedKey = key.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName);
                        let rawInst = null;
                        if (liveGroup && liveGroup.instructions && liveGroup.instructions[key]) {
                            rawInst = liveGroup.instructions[key];
                        } else if (snapGroup.instructions && snapGroup.instructions[key]) {
                            rawInst = snapGroup.instructions[key];
                        }
                        let instructionStr = rawInst ? ` (C: ${rawInst})` : '';
                        groupVars.push(`${resolvedKey}: ${val}${instructionStr}`);
                    });
                    groupStr += `[${snapGroup.name || 'Vars'}]: ` + groupVars.join(' | ') + "\n";
                }
            });
        }
    }
    
    let stateBlock = "";
    if (clothStr || bioStr || groupStr) {
        stateBlock = `${hState}\n${clothStr}${bioStr}${groupStr}\n`;
    }
    
    // 5. Instructions (Rules)
    let extraSchema = "";
    if (extension_settings.stateTracker.clothing_enabled) extraSchema += ' "clothing_events": ["[EQUIP: item_id]"],';
    if (extension_settings.stateTracker.biology_config?.enabled) extraSchema += ' "biology_events": ["ate_food"],';
    
    let finalTask = hTask;
    if (extension_settings.stateTracker.clothing_enabled) {
        finalTask = finalTask.replace('{{rule_clothing}}', "- CLOTHING: Do NOT use numbers or arrays. Output 'clothing_events' as an array of tags. Tags allowed: [EQUIP: item_id], [UNEQUIP: item_id]. Example: {\"clothing_events\": [\"[EQUIP: jacket]\"]}");
    } else {
        finalTask = finalTask.replace('{{rule_clothing}}\n', '').replace('{{rule_clothing}}', '');
    }

    if (extension_settings.stateTracker.biology_config?.enabled) {
        finalTask = finalTask.replace('{{rule_biology}}', "- BIOLOGY: Do NOT use numbers. Output 'biology_events' as an array of triggered events based on the chat. Valid events: \"ate_food\", \"drank_fluid\", \"slept_deep\", \"slept_light\", \"intense_activity\", \"bathed\", \"used_toilet\", \"sex_unprotected\". Example: \"biology_events\": [\"ate_food\"]");
    } else {
        finalTask = finalTask.replace('{{rule_biology}}\n', '').replace('{{rule_biology}}', '');
    }

    let hasVisibleGroups = false;
    if (snapshot.groups) {
        snapshot.groups.forEach(snapGroup => {
            const liveGroup = liveData.groups.find(g => g.name === snapGroup.name);
            if (!((liveGroup && liveGroup.hidden) || snapGroup.hidden)) hasVisibleGroups = true;
        });
    }
    
    if (hasVisibleGroups) {
        finalTask = finalTask.replace('{{rule_groups}}', "- GROUPS: Update custom variables using their exact name. CRITICAL: ONLY output variables that CHANGED value. Do NOT output variables if their value remains exactly the same.");
    } else {
        finalTask = finalTask.replace('{{rule_groups}}\n', '').replace('{{rule_groups}}', '');
    }

    // 6. JSON Schema Expected
    const schemaInstructions = `${finalTask} {"StateTracker": {${extraSchema} "variable_name": "new_value"}}`;

    // Final Prompt Assembly matching the requested order
    const prompt = chatHist + "\n" + stateBlock + schemaInstructions;
    return prompt;
}

export async function executeTinyLLM(mesId, message, abortSignal = null) {
    const context = SillyTavern.getContext();
    const snapshot = message.extra.stateTrackerSnapshot;
    
    if (!extension_settings.stateTracker.tinyLLM) return { changed: 0, error: "No settings", parsedUpdates: {} };
    const tinyCfg = extension_settings.stateTracker.tinyLLM;
    
    const prompt = await buildTinyPrompt(mesId, snapshot);
    const sys = tinyCfg.sysprompt;
    const profileId = tinyCfg.profile;
    const maxTokens = tinyCfg.maxTokens || 200;
    
    let resultText = "";
    
    if (profileId === 'main_api') {
        try {
            resultText = await generateRaw({ prompt: prompt, systemPrompt: sys, responseLength: maxTokens });
        } catch (e) {
            resultText = await generateRaw(prompt, sys);
        }
    } else {
        if (!ConnectionManagerRequestService || !ConnectionManagerRequestService.sendRequest) {
            throw new Error("Connection Manager not available.");
        }
        const messages = [ { role: 'system', content: sys }, { role: 'user', content: prompt } ];
        const customParams = abortSignal ? { signal: abortSignal } : {};
        const resp = await ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, customParams);
        if (resp && resp.choices && resp.choices[0] && resp.choices[0].message) {
            resultText = resp.choices[0].message.content;
        } else {
            throw new Error("Null response from API.");
        }
    }
    
    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        throw new Error("LLM did not return JSON format.\\nReceived:\\n" + resultText);
    }
    
    const jsonStr = resultText.substring(firstBrace, lastBrace + 1);
    
    let parsed;
    try { 
        parsed = JSON.parse(jsonStr); 
    } catch (je) { 
        throw new Error("Malformed JSON.\\nReceived:\\n" + jsonStr); 
    }
    
    let updates = parsed.StateTracker || parsed;
    
    // Filter out redundant values that the LLM stupidly hallucinates
    for (const key of Object.keys(updates)) {
        const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
        let isRedundant = false;
        if (cleanKey !== 'clothing_equipped' && cleanKey !== 'clothing_events' && cleanKey !== 'biology_events' && snapshot && snapshot.groups) {
            for (let g of snapshot.groups) {
                for (let vKey in g.variables) {
                    const normKey = vKey.trim().toLowerCase().replace(/\s+/g, '_');
                    if (normKey.includes(cleanKey) || cleanKey.includes(normKey)) {
                        if (String(g.variables[vKey]) === String(updates[key])) {
                            isRedundant = true;
                        }
                    }
                }
            }
        }
        if (isRedundant) {
            delete updates[key];
        }
    }
    
    // Devolvemos los updates puros, no los aplicamos aqui. UI los aplicara.
    return { changed: Object.keys(updates).length, text: resultText, parsedUpdates: updates };
}

export async function applyTinyUpdates(updates, mesId, snapshot) {
    if (!updates || Object.keys(updates).length === 0) return 0;
    
    const context = SillyTavern.getContext();
    const { getCharacterData, saveAndUpdateHUD } = await import('./stateManager.js');
    const data = getCharacterData();
    let changesMade = 0;
    
    for (const [key, val] of Object.entries(updates)) {
        const cleanKey = key.trim().toLowerCase();
        
        if (cleanKey === 'clothing_events' && Array.isArray(val)) {
            if (data && data.clothing) {
                let eventString = val.join(' ');
                const { processClothingEvents } = await import('./clothingEngine.js');
                const charName = context.characters[context.characterId]?.name || 'Char';
                const avatar = context.characters[context.characterId]?.avatar || '';
                const cResult = processClothingEvents(eventString, data, charName, avatar);
                if (cResult.changed) changesMade++;
            }
            continue;
        }
        
        if (cleanKey === 'clothing_equipped' && Array.isArray(val)) {
            // Legacy fallback if LLM disobeys or uses old format
            if (data && data.clothing) {
                data.clothing.equipped = val;
                changesMade++;
            }
            continue;
        }
        
        if (cleanKey === 'biology_events' && Array.isArray(val)) {
            if (data && data.biology) {
                // Build a fake text block with all events to pass to the native engine
                let eventString = val.map(ev => '[EVENT: ' + ev + ']').join(' ');
                const { processBiologyEvents } = await import('./biologyEngine.js');
                const bioResult = processBiologyEvents(eventString, data);
                if (bioResult.changed) changesMade++;
            }
            continue;
        }
        
        const searchKey = cleanKey.replace(/\s+/g, '_');
        
        if (snapshot.groups) {
            for (let g of snapshot.groups) {
                for (let vKey in g.variables) {
                    const normKey = vKey.trim().toLowerCase().replace(/\s+/g, '_');
                    if (normKey.includes(searchKey) || searchKey.includes(searchKey)) {
                        g.variables[vKey] = val;
                    }
                }
            }
        }
        
        if (parseInt(mesId) === context.chat.length - 1 && data && data.groups) {
            for (let g of data.groups) {
                for (let vKey in g.variables) {
                    const normKey = vKey.trim().toLowerCase().replace(/\s+/g, '_');
                    if (normKey.includes(searchKey) || searchKey.includes(searchKey)) {
                        g.variables[vKey] = val;
                        changesMade++;
                    }
                }
            }
        } else if (parseInt(mesId) !== context.chat.length - 1) {
            changesMade++;
        }
    }
    
    if (changesMade > 0 && parseInt(mesId) === context.chat.length - 1) {
        saveAndUpdateHUD();
    }
    
    return changesMade;
}
