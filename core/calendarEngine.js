import { getCharacterData, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';

export function initCalendarSettings() {
    if (!extension_settings.stateTracker.events) {
        extension_settings.stateTracker.events = {
            enabled: true,
            list: [] 
            // { id, name, month, day, recurrent, year, desc }
        };
    }
}

export function getActiveEvents(timestamp) {
    if (!extension_settings.stateTracker.events || !extension_settings.stateTracker.events.enabled) return [];
    
    const d = new Date(timestamp);
    const month = d.getUTCMonth();
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    
    return extension_settings.stateTracker.events.list.filter(e => {
        if (parseInt(e.month) !== month || parseInt(e.day) !== day) return false;
        if (!e.recurrent && parseInt(e.year) !== year) return false;
        return true;
    });
}

export function calculateAges(timestamp) {
    if (!extension_settings.stateTracker.events || !extension_settings.stateTracker.events.enabled) return null;
    
    const chatData = getCharacterData();
    if (!chatData || !chatData.calendar) return null;
    
    const current = new Date(timestamp);
    let charAge = null;
    let userAge = null;
    let isCharBday = false;
    let isUserBday = false;
    
    if (chatData.calendar.charBirthdate) {
        const b = new Date(chatData.calendar.charBirthdate);
        let age = current.getUTCFullYear() - b.getUTCFullYear();
        const m = current.getUTCMonth() - b.getUTCMonth();
        if (m < 0 || (m === 0 && current.getUTCDate() < b.getUTCDate())) {
            age--;
        }
        charAge = age;
        if (m === 0 && current.getUTCDate() === b.getUTCDate()) isCharBday = true;
    }
    
    if (chatData.calendar.userBirthdate) {
        const b = new Date(chatData.calendar.userBirthdate);
        let age = current.getUTCFullYear() - b.getUTCFullYear();
        const m = current.getUTCMonth() - b.getUTCMonth();
        if (m < 0 || (m === 0 && current.getUTCDate() < b.getUTCDate())) {
            age--;
        }
        userAge = age;
        if (m === 0 && current.getUTCDate() === b.getUTCDate()) isUserBday = true;
    }
    
    return { charAge, userAge, isCharBday, isUserBday };
}

export function addEvent(eventData) {
    initCalendarSettings();
    eventData.id = Date.now().toString();
    extension_settings.stateTracker.events.list.push(eventData);
    saveAndUpdateHUD();
}

export function removeEvent(id) {
    if (!extension_settings.stateTracker.events) return;
    extension_settings.stateTracker.events.list = extension_settings.stateTracker.events.list.filter(e => e.id !== id);
    saveAndUpdateHUD();
}
