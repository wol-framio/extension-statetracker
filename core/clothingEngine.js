import { extension_settings } from '../../../../extensions.js';

export const CLOTHING_SLOTS = {
    head: { name_es: 'Cabeza', name_en: 'Head' },
    face: { name_es: 'Rostro/Ojos', name_en: 'Face/Eyes' },
    lips: { name_es: 'Labios', name_en: 'Lips' },
    makeup: { name_es: 'Maquillaje general', name_en: 'Makeup' },
    neck: { name_es: 'Cuello', name_en: 'Neck' },
    torso_inner: { name_es: 'Torso (Interior)', name_en: 'Torso (Inner)' },
    torso_main: { name_es: 'Torso (Principal)', name_en: 'Torso (Main)' },
    torso_outer: { name_es: 'Torso (Exterior)', name_en: 'Torso (Outer)' },
    hands: { name_es: 'Manos/Guantes', name_en: 'Hands/Gloves' },
    fingers: { name_es: 'Uñas/Dedos', name_en: 'Fingers/Nails' },
    legs_inner: { name_es: 'Piernas (Interior)', name_en: 'Legs (Inner)' },
    hosiery: { name_es: 'Calcetería/Medias', name_en: 'Hosiery' },
    legs_main: { name_es: 'Piernas (Principal)', name_en: 'Legs (Main)' },
    feet: { name_es: 'Pies', name_en: 'Feet' },
    accessory: { name_es: 'Accesorios/Bolsos', name_en: 'Accessories' }
};

export function getCharacterProfile(avatar) {
    if (!extension_settings.stateTracker.characterProfiles) {
        extension_settings.stateTracker.characterProfiles = {};
    }
    if (!avatar) return null;
    
    if (!extension_settings.stateTracker.characterProfiles[avatar]) {
        extension_settings.stateTracker.characterProfiles[avatar] = {
            sex: 'female', // default
            pronouns: '',
            wardrobe: {
                items: {},
                outfits: {}
            }
        };
    }
    return extension_settings.stateTracker.characterProfiles[avatar];
}

export function initClothingState(chatData) {
    if (!chatData.clothing) {
        chatData.clothing = {
            equipped: [] // Array of item IDs
        };
    }
}

export function processClothingEvents(text, chatData, charName, avatar) {
    if (!extension_settings.stateTracker.clothing_enabled) return { cleanText: text, changed: false };
    if (!chatData || !chatData.clothing) return { cleanText: text, changed: false };
    
    const profile = getCharacterProfile(avatar);
    if (!profile) return { cleanText: text, changed: false };
    
    let changed = false;
    let cleanText = text;
    
    // [EQUIP: item_id]
    const equipRegex = /\[EQUIP:\s*([a-zA-Z0-9_]+)\]/gi;
    let match;
    while ((match = equipRegex.exec(text)) !== null) {
        const itemId = match[1].toLowerCase();
        if (profile.wardrobe.items[itemId] && !chatData.clothing.equipped.includes(itemId)) {
            // Remove old item in same slot
            const newSlot = profile.wardrobe.items[itemId].slot;
            chatData.clothing.equipped = chatData.clothing.equipped.filter(id => {
                const existingItem = profile.wardrobe.items[id];
                return !(existingItem && existingItem.slot === newSlot);
            });
            chatData.clothing.equipped.push(itemId);
            changed = true;
        }
    }
    cleanText = cleanText.replace(equipRegex, '').trim();
    
    // [UNEQUIP: item_id]
    const unequipRegex = /\[UNEQUIP:\s*([a-zA-Z0-9_]+)\]/gi;
    while ((match = unequipRegex.exec(text)) !== null) {
        const itemId = match[1].toLowerCase();
        if (chatData.clothing.equipped.includes(itemId)) {
            chatData.clothing.equipped = chatData.clothing.equipped.filter(id => id !== itemId);
            changed = true;
        }
    }
    cleanText = cleanText.replace(unequipRegex, '').trim();
    
    // [OUTFIT: outfit_id]
    const outfitRegex = /\[OUTFIT:\s*([a-zA-Z0-9_]+)\]/gi;
    while ((match = outfitRegex.exec(text)) !== null) {
        const outfitId = match[1].toLowerCase();
        if (profile.wardrobe.outfits[outfitId]) {
            chatData.clothing.equipped = [...profile.wardrobe.outfits[outfitId]];
            changed = true;
        }
    }
    cleanText = cleanText.replace(outfitRegex, '').trim();
    
    return { cleanText, changed };
}

export function getAnatomyState(chatData, profile, lang = 'en') {
    const isEn = lang === 'en';
    const sex = profile.sex || 'female';
    
    const equippedItems = chatData.clothing.equipped.map(id => profile.wardrobe.items[id]).filter(Boolean);
    const slotsFilled = equippedItems.map(item => item.slot);
    
    let exposedParts = [];
    
    // Torso logic
    if (!slotsFilled.includes('torso_inner') && !slotsFilled.includes('torso_main') && !slotsFilled.includes('torso_outer')) {
        if (sex === 'female') {
            exposedParts.push(isEn ? 'exposed breasts' : 'senos descubiertos');
        } else {
            exposedParts.push(isEn ? 'bare chest' : 'pecho descubierto');
        }
    }
    
    // Legs/Groin logic
    if (!slotsFilled.includes('legs_inner') && !slotsFilled.includes('legs_main')) {
        if (sex === 'female') {
            exposedParts.push(isEn ? 'exposed vulva' : 'vulva descubierta');
        } else if (sex === 'male') {
            exposedParts.push(isEn ? 'exposed penis' : 'pene descubierto');
        } else {
            exposedParts.push(isEn ? 'exposed genitals' : 'genitales descubiertos');
        }
    }
    
    // Feet
    if (!slotsFilled.includes('feet')) {
        exposedParts.push(isEn ? 'barefoot' : 'pies descalzos');
    }
    
    // Hands
    if (!slotsFilled.includes('hands')) {
        exposedParts.push(isEn ? 'bare hands' : 'manos desnudas');
    }
    
    return exposedParts;
}

export function getClothingPrompt(chatData, charName, avatar) {
    if (!extension_settings.stateTracker.clothing_enabled) return '';
    const profile = getCharacterProfile(avatar);
    if (!profile) return '';
    
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    
    const equippedItems = chatData.clothing.equipped.map(id => profile.wardrobe.items[id]).filter(Boolean);
    
    let prompt = '';
    
    if (equippedItems.length === 0) {
        prompt += isEn ? `[${charName}'s Clothing: Completely naked]\n` : `[Ropa de ${charName}: Completamente desnudo/a]\n`;
    } else {
        const itemNames = equippedItems.map(i => isEn ? (i.name_en || i.name) : i.name).join(', ');
        prompt += isEn ? `[${charName}'s Clothing: ${itemNames}]\n` : `[Ropa de ${charName}: ${itemNames}]\n`;
    }
    
    const exposed = getAnatomyState(chatData, profile, lang);
    if (exposed.length > 0) {
        prompt += isEn ? `[${charName}'s Anatomy Exposed: ${exposed.join(', ')}]\n` : `[Anatomía Expuesta de ${charName}: ${exposed.join(', ')}]\n`;
    }
    
    const availableItems = Object.keys(profile.wardrobe.items);
    if (availableItems.length > 0) {
        const invList = availableItems.join(', ');
        prompt += isEn ? `[Available Wardrobe Items to Equip: ${invList}]\n` : `[Prendas Disponibles para Equipar: ${invList}]\n`;
    }
    
    const availableOutfits = Object.keys(profile.wardrobe.outfits);
    if (availableOutfits.length > 0) {
        const outList = availableOutfits.join(', ');
        prompt += isEn ? `[Available Outfits to Equip: ${outList}]\n` : `[Conjuntos Disponibles para Equipar: ${outList}]\n`;
    }
    
    return prompt.trim();
}

export function getClothingLLMInstructions() {
    if (!extension_settings.stateTracker.clothing_enabled) return '';
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    
    if (isEn) {
        return `[System Note: To interact with clothing, strictly output tags at the end of your response. To put on an item: [EQUIP: item_id]. To take off an item: [UNEQUIP: item_id]. To change to an outfit: [OUTFIT: outfit_id]. These tags modify the inventory state seamlessly.]`;
    } else {
        return `[Nota del Sistema: Para interactuar con la ropa, emite etiquetas estrictamente al final de tu respuesta. Para ponerse algo: [EQUIP: item_id]. Para quitarse algo: [UNEQUIP: item_id]. Para cambiar a un conjunto: [OUTFIT: outfit_id]. Estas etiquetas modifican el estado de inventario de manera oculta.]`;
    }
}
