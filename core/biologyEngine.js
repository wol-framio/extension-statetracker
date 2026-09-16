import { getCharacterData, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';

export const BIOLOGY_SYSTEMS = {
    metabolism: { id: 'metabolism', name: 'Metabolismo (Hambre y Sed)', desc: 'El personaje necesitará comer y beber.', default: true },
    sleep: { id: 'sleep', name: 'Energía y Fatiga', desc: 'El personaje se cansará y necesitará dormir.', default: true },
    hygiene: { id: 'hygiene', name: 'Higiene y Sudor', desc: 'El personaje se ensuciará con el tiempo o la actividad física.', default: false },
    excretion: { id: 'excretion', name: 'Excreción (Baño)', desc: 'El personaje necesitará usar el retrete tras comer/beber.', default: false },
    pregnancy: { id: 'pregnancy', name: 'Ciclo Reproductivo', desc: 'Posibilidad de embarazo tras eventos sin protección.', default: false }
};

export function initBiologySettings(chatData) {
    if (!extension_settings.stateTracker.biology_config) {
        extension_settings.stateTracker.biology_config = {
            enabled: true,
            metabolism: true,
            sleep: true,
            hygiene: false,
            excretion: false,
            pregnancy: false,
            pregnancy_chance: 25 // 25% by default
        };
    }
    
    if (chatData && !chatData.biology) {
        chatData.biology = {
            hunger: 0.0,
            thirst: 0.0,
            fatigue: 0.0,
            hygiene: 100.0,
            bladder: 0.0,
            bowels: 0.0,
            is_pregnant: false,
            pregnancy_days: 0
        };
    }
}

export function advanceBiology(minutesDelta, chatData) {
    if (!extension_settings.stateTracker.biology_config?.enabled) return;
    if (!chatData || !chatData.biology) return;
    
    const config = extension_settings.stateTracker.biology_config;
    const bio = chatData.biology;
    
    const hours = minutesDelta / 60.0;
    
    // Tasas:
    // Hambre: 100% en 12h = 8.33% por hora
    if (config.metabolism) {
        bio.hunger = Math.max(0, Math.min(100, bio.hunger + (hours * 8.33)));
        // Sed: 100% en 8h = 12.5% por hora
        bio.thirst = Math.max(0, Math.min(100, bio.thirst + (hours * 12.5)));
    }
    
    // Fatiga: 100% en 18h = 5.55% por hora
    if (config.sleep) {
        bio.fatigue = Math.max(0, Math.min(100, bio.fatigue + (hours * 5.55)));
    }
    
    // Higiene: 0% en 48h = 2.08% de suciedad por hora. (100 = limpio)
    if (config.hygiene) {
        bio.hygiene = Math.max(0, Math.min(100, bio.hygiene - (hours * 2.08)));
    }
    
    if (config.pregnancy && bio.is_pregnant) {
        bio.pregnancy_days = Math.max(0, bio.pregnancy_days + (hours / 24.0));
    }
    
    if (config.excretion) {
        // Vejiga: 100% en 6h = 16.6% por hora
        bio.bladder = Math.max(0, Math.min(100, bio.bladder + (hours * 16.6)));
        // Intestinos: 100% en 24h = 4.16% por hora
        bio.bowels = Math.max(0, Math.min(100, bio.bowels + (hours * 4.16)));
    }
}

export function processBiologyEvents(text, chatData) {
    if (!extension_settings.stateTracker.biology_config?.enabled) return { cleanText: text, changed: false };
    if (!chatData || !chatData.biology) return { cleanText: text, changed: false };
    
    const bio = chatData.biology;
    const config = extension_settings.stateTracker.biology_config;
    let changed = false;
    
    const regex = /\[EVENT:\s*([a-zA-Z_]+)\]/gi;
    let cleanText = text;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        const ev = match[1].toLowerCase();
        
        switch (ev) {
            case 'ate_food':
                if (config.metabolism) bio.hunger = 0;
                if (config.excretion) bio.bowels = Math.min(100, bio.bowels + 30); // Comer acelera las ganas
                changed = true;
                break;
            case 'drank_fluid':
                if (config.metabolism) bio.thirst = 0;
                if (config.excretion) bio.bladder = Math.min(100, bio.bladder + 40); // Beber acelera las ganas
                changed = true;
                break;
            case 'slept_deep':
                if (config.sleep) bio.fatigue = 0;
                changed = true;
                break;
            case 'slept_light':
                if (config.sleep) bio.fatigue = Math.max(0, bio.fatigue - 40);
                changed = true;
                break;
            case 'intense_activity':
                if (config.sleep) bio.fatigue = Math.min(100, bio.fatigue + 20);
                if (config.hygiene) bio.hygiene = Math.max(0, bio.hygiene - 30);
                if (config.metabolism) {
                    bio.hunger = Math.min(100, bio.hunger + 15);
                    bio.thirst = Math.min(100, bio.thirst + 25);
                }
                changed = true;
                break;
            case 'bathed':
                if (config.hygiene) bio.hygiene = 100;
                changed = true;
                break;
            case 'used_toilet':
                if (config.excretion) {
                    bio.bladder = 0;
                    bio.bowels = 0;
                }
                if (config.hygiene) bio.hygiene = Math.max(0, bio.hygiene - 5);
                changed = true;
                break;
            case 'sex_unprotected':
                if (config.pregnancy && !bio.is_pregnant) {
                    const roll = Math.random() * 100;
                    if (roll <= config.pregnancy_chance) {
                        bio.is_pregnant = true;
                        bio.pregnancy_days = 0;
                    }
                }
                // Also counts as intense activity
                if (config.sleep) bio.fatigue = Math.min(100, bio.fatigue + 15);
                if (config.hygiene) bio.hygiene = Math.max(0, bio.hygiene - 20);
                changed = true;
                break;
        }
    }
    
    if (changed) {
        cleanText = text.replace(/\[EVENT:\s*[a-zA-Z_]+\]/gi, '').trim();
    }
    
    return { cleanText, changed };
}

export function getBiologyPrompt(chatData) {
    if (!extension_settings.stateTracker.biology_config?.enabled) return '';
    if (!chatData || !chatData.biology) return '';
    
    const bio = chatData.biology;
    const config = extension_settings.stateTracker.biology_config;
    
    let states = [];
    
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    
    if (config.metabolism) {
        if (bio.hunger > 90) states.push(isEn ? "Extreme hunger (Almost starving, stomach hurting)" : "Hambre extrema (Casi inanición, estómago doliendo)");
        else if (bio.hunger > 70) states.push(isEn ? "Severe hunger (Stomach growling, needs to eat urgently)" : "Hambre severa (estómago rugiendo, necesita comer urgente)");
        else if (bio.hunger > 40) states.push(isEn ? "Mild hunger (Appetite)" : "Hambre leve (apetito)");
        else states.push(isEn ? "Not hungry (Satiated)" : "Sin hambre (saciad@)");
        
        if (bio.thirst > 90) states.push(isEn ? "Critical dehydration (Dry mouth, dizzy)" : "Deshidratación crítica (boca seca, mareos)");
        else if (bio.thirst > 70) states.push(isEn ? "Intense thirst (Dry throat, needs to drink urgently)" : "Sed intensa (garganta seca, necesita beber urgente)");
        else if (bio.thirst > 40) states.push(isEn ? "Mild thirst" : "Sed leve");
        else states.push(isEn ? "Not thirsty (Hydrated)" : "Sin sed (hidratad@)");
    }
    
    if (config.sleep) {
        if (bio.fatigue > 90) states.push(isEn ? "Extreme exhaustion (About to faint, barely keeping eyes open)" : "Agotamiento extremo (A punto de desmayarse, apenas puede mantener los ojos abiertos)");
        else if (bio.fatigue > 70) states.push(isEn ? "Severe fatigue (Very sleepy, constantly yawning)" : "Fatiga severa (Mucho sueño, bostezos constantes)");
        else if (bio.fatigue > 50) states.push(isEn ? "Moderate fatigue" : "Cansancio moderado");
        else states.push(isEn ? "Well rested (Energetic)" : "Bien descansad@ (Con energía)");
    }
    
    if (config.hygiene) {
        if (bio.hygiene < 15) states.push(isEn ? "Extremely dirty and smelly (Reeks of old sweat, physical discomfort)" : "Extremadamente suci@ y oloros@ (Apesta a sudor viejo, incomodidad física)");
        else if (bio.hygiene < 40) states.push(isEn ? "Dirty (Needs a bath, smells of sweat)" : "Suci@ (Necesita un baño, huele a sudor)");
        else if (bio.hygiene > 80) states.push(isEn ? "Completely clean (Perfect hygiene)" : "Completamente limpi@ (Higiene perfecta)");
        else states.push(isEn ? "Normal hygiene" : "Higiene normal");
    }
    
    if (config.excretion) {
        if (bio.bladder > 90) states.push(isEn ? "Extreme urge to urinate (Cannot hold it anymore, lower belly pain)" : "Ganas extremas de orinar (no puede aguantar más, dolor en vientre)");
        else if (bio.bladder > 70) states.push(isEn ? "Strong urge to urinate" : "Ganas fuertes de orinar");
        else if (bio.bladder < 20) states.push(isEn ? "Empty bladder (No urge to urinate)" : "Vejiga vacía (sin ganas de orinar)");
        
        if (bio.bowels > 90) states.push(isEn ? "Extreme urge to defecate (Stomach pain, imminent urgency)" : "Ganas extremas de defecar (dolor de estómago, urgencia inminente)");
        else if (bio.bowels > 70) states.push(isEn ? "Urge to use the toilet" : "Ganas de usar el retrete");
        else if (bio.bowels < 20) states.push(isEn ? "Empty bowels (No urge to defecate)" : "Intestinos vacíos (sin ganas de defecar)");
    }
    
    if (config.pregnancy && bio.is_pregnant) {
        states.push(isEn ? `Pregnant (Gestation day: ${Math.floor(bio.pregnancy_days)})` : `Embarazada (Día de gestación: ${Math.floor(bio.pregnancy_days)})`);
        if (bio.pregnancy_days > 15 && bio.pregnancy_days < 60) states.push(isEn ? "Pregnancy symptoms (Morning sickness, dizziness, cravings)" : "Síntomas de embarazo (Náuseas matutinas, mareos, antojos)");
    }
    
    if (states.length > 0) {
        return isEn ? `[Physical/Biological States of {{char}}: ${states.join(' | ')}]\n` : `[Estados Físicos/Biológicos de {{char}}: ${states.join(' | ')}]\n`;
    }
    return '';
}

export function getBiologyLLMInstructions() {
    if (!extension_settings.stateTracker.biology_config?.enabled) return '';
    const config = extension_settings.stateTracker.biology_config;
    
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    
    let prompt = isEn ? 
        `\n[BIOLOGICAL SIMULATOR: You are aware of your physical needs. If you perform any of these actions in your response, you MUST append the exact tag at the end of your message:]\n` :
        `\n[SIMULADOR BIOLÓGICO: Eres consciente de tus necesidades físicas. Si realizas alguna de estas acciones en tu respuesta, DEBES agregar la etiqueta exacta al final de tu mensaje:]\n`;
        
    let tags = [];
    
    if (config.metabolism) {
        tags.push(isEn ? `- [EVENT: ate_food] (If you ate solid food)` : `- [EVENT: ate_food] (Si comiste algo sólido)`);
        tags.push(isEn ? `- [EVENT: drank_fluid] (If you drank water or fluids)` : `- [EVENT: drank_fluid] (Si bebiste agua o líquidos)`);
    }
    if (config.sleep) {
        tags.push(isEn ? `- [EVENT: slept_deep] (If you slept for several hours)` : `- [EVENT: slept_deep] (Si dormiste varias horas)`);
        tags.push(isEn ? `- [EVENT: slept_light] (If you took a short nap)` : `- [EVENT: slept_light] (Si tomaste una siesta corta)`);
    }
    if (config.hygiene || config.sleep || config.metabolism) {
        tags.push(isEn ? `- [EVENT: intense_activity] (If you ran, fought, or exerted yourself)` : `- [EVENT: intense_activity] (Si corriste, peleaste, o hiciste mucho esfuerzo)`);
    }
    if (config.hygiene) {
        tags.push(isEn ? `- [EVENT: bathed] (If you took a bath or shower)` : `- [EVENT: bathed] (Si tomaste un baño o ducha)`);
    }
    if (config.excretion) {
        tags.push(isEn ? `- [EVENT: used_toilet] (If you defecated or urinated)` : `- [EVENT: used_toilet] (Si defecaste u orinaste)`);
    }
    if (config.pregnancy) {
        tags.push(isEn ? `- [EVENT: sex_unprotected] (If there was unprotected intimacy or penetration)` : `- [EVENT: sex_unprotected] (Si hubo intimidad o penetración sin protección)`);
    }
    
    if (tags.length === 0) return '';
    
    prompt += tags.join('\n');
    prompt += isEn ? `\n(Example: "...I ate the apple." [EVENT: ate_food])\n` : `\n(Ejemplo: "...me comí la manzana." [EVENT: ate_food])\n`;
    return prompt;
}
