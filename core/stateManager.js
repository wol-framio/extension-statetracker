import { extension_settings } from '../../../../extensions.js';
import { updateHUD } from '../ui/hudRenderer.js';
import { saveSettingsDebounced } from '../../../../../script.js';

export function saveAndUpdateHUD() {
    saveSettingsDebounced();
    updateHUD();
}

export function getCharacterAvatar() {
    const context = SillyTavern.getContext();
    if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
        return context.characters[context.characterId].avatar;
    }
    return null;
}

export function getCharacterName() {
    const context = SillyTavern.getContext();
    if (context.characterId !== undefined && context.characters && context.characters[context.characterId]) {
        return context.characters[context.characterId].name;
    }
    return 'Character';
}

export function getCharacterData() {
    const context = SillyTavern.getContext();
    const avatar = getCharacterAvatar();
    const chatId = context.chatId;

    if (!avatar) return { groups: [] };

    // 1. Initialize character base state if it doesn't exist
    if (!extension_settings.stateTracker.characters[avatar]) {
        // Clone from default preset layout if available
        const defaultPresetName = "Default RPG Roleplay";
        if (extension_settings.stateTracker.presets[defaultPresetName]) {
            extension_settings.stateTracker.characters[avatar] = {
                groups: JSON.parse(JSON.stringify(extension_settings.stateTracker.presets[defaultPresetName]))
            };
        } else {
            // Fallback manual initialization
            extension_settings.stateTracker.characters[avatar] = {
                groups: [
                    {
                        name: "General",
                        hidden: false,
                        collapsed: false,
                        variables: {
                            "location_world": "Earth",
                            "location_room": "Bedroom"
                        }
                    }
                ]
            };
        }
    } else {
        // Migrate old flat structure to groups format if needed
        const rawData = extension_settings.stateTracker.characters[avatar];
        if (!rawData.groups) {
            const groups = [{
                name: "General",
                hidden: false,
                collapsed: false,
                variables: {}
            }];
            Object.entries(rawData).forEach(([k, v]) => {
                let key = k.replace(/jane/gi, '{{char}}').replace(/yasuo/gi, '{{user}}');
                groups[0].variables[key] = v;
            });
            extension_settings.stateTracker.characters[avatar] = { groups };
            saveSettingsDebounced();
        }
    }

    // 2. Session/Chat specific tracking
    if (chatId) {
        if (!extension_settings.stateTracker.chats) {
            extension_settings.stateTracker.chats = {};
        }
        // If this specific chat has no state yet, inherit from the character's base state
        if (!extension_settings.stateTracker.chats[chatId]) {
            extension_settings.stateTracker.chats[chatId] = JSON.parse(JSON.stringify(extension_settings.stateTracker.characters[avatar]));
            saveSettingsDebounced();
        }
        return extension_settings.stateTracker.chats[chatId];
    }

    // Fallback if not inside a chat (e.g. character management screen)
    return extension_settings.stateTracker.characters[avatar];
}

export function findDatabaseKey(llmKey, groups) {
    const context = SillyTavern.getContext();
    const charName = (context.characterId !== undefined ? context.characters[context.characterId].name : 'Jane').toLowerCase();
    const userName = (context.userName || 'Yasuo').toLowerCase();

    for (let group of groups) {
        for (let key of Object.keys(group.variables)) {
            const compareKey = key.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, userName).toLowerCase().replace(/\s+/g, '_');
            if (compareKey === llmKey.toLowerCase().replace(/\s+/g, '_')) {
                return { group, key };
            }
        }
    }
    return null;
}
