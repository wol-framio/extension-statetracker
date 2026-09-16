import { getCharacterData, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';
import { updateWeatherIfNeeded, formatWeatherPrompt, WEATHER_DICTIONARY, getCurrentTemperature } from './weatherEngine.js';
import { calculateAges, getActiveEvents } from './calendarEngine.js';
import { advanceBiology } from './biologyEngine.js';

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_EPOCH = Date.UTC(2024, 0, 1, 8, 0); // Jan 1, 2024, 08:00 AM UTC

const TIME_OF_DAY = [
    { name_es: "Madrugada", name_en: "Late Night", start: 0, end: 5 * 60, desc: "Totalmente de noche, silencio absoluto.", isNight: true },
    { name_es: "Amanecer", name_en: "Dawn", start: 5 * 60, end: 7 * 60, desc: "El sol empieza a salir, iluminación tenue.", isNight: false },
    { name_es: "Mañana", name_en: "Morning", start: 7 * 60, end: 12 * 60, desc: "Es de día, luz brillante.", isNight: false },
    { name_es: "Mediodía", name_en: "Noon", start: 12 * 60, end: 14 * 60, desc: "Sol en su punto más alto.", isNight: false },
    { name_es: "Tarde", name_en: "Afternoon", start: 14 * 60, end: 19 * 60, desc: "El sol empieza a bajar.", isNight: false },
    { name_es: "Atardecer", name_en: "Dusk", start: 19 * 60, end: 20 * 60 + 30, desc: "El sol se oculta, colores naranjas y sombras.", isNight: false },
    { name_es: "Noche", name_en: "Night", start: 20 * 60 + 30, end: 24 * 60, desc: "Oscuridad, cielo nocturno.", isNight: true }
];

export function getTimestamp(timeObj) {
    if (!timeObj) return DEFAULT_EPOCH;
    if (timeObj.timestamp !== undefined) return timeObj.timestamp;
    if (timeObj.minutes !== undefined) return DEFAULT_EPOCH + (timeObj.minutes * 60000);
    return DEFAULT_EPOCH;
}

export function parseTimestamp(timestamp, weatherState = null, lang = 'es') {
    const d = new Date(timestamp);
    const isEn = lang === 'en';
    
    const dayName = isEn ? DAYS_EN[d.getUTCDay()] : DAYS_ES[d.getUTCDay()];
    const monthName = isEn ? MONTHS_EN[d.getUTCMonth()] : MONTHS_ES[d.getUTCMonth()];
    const date = d.getUTCDate();
    const year = d.getUTCFullYear();
    
    const hours = d.getUTCHours();
    const mins = d.getUTCMinutes();
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMins = mins.toString().padStart(2, '0');
    
    const timeString = `${displayHours}:${displayMins} ${ampm}`;
    const timeString24h = `${hours.toString().padStart(2, '0')}:${displayMins}`;
    
    const timeStringVisual = extension_settings.stateTracker?.use24Hour ? timeString24h : timeString;
    
    const timeOfDay = hours * 60 + mins;
    let periodName = isEn ? "Night" : "Noche";
    let periodDesc = "";
    let isNight = true;
    
    for (let p of TIME_OF_DAY) {
        if (timeOfDay >= p.start && timeOfDay < p.end) {
            periodName = isEn ? p.name_en : p.name_es;
            periodDesc = p.desc;
            isNight = p.isNight;
            break;
        }
    }
    
    let weatherStringVisual = "";
    if (weatherState && WEATHER_DICTIONARY[weatherState.type]) {
        const def = WEATHER_DICTIONARY[weatherState.type];
        const wName = isEn && def.name_en ? def.name_en : def.name;
        weatherStringVisual = isEn ? ` | Weather: ${wName}` : ` | Clima: ${wName}`;
        if (weatherState.baseTempC !== null && weatherState.baseTempC !== undefined) {
            weatherStringVisual += ` (${getCurrentTemperature(weatherState, isNight)}°C)`;
        }
    }
    
    return {
        timestamp,
        dayName,
        monthName,
        date,
        year,
        hours,
        mins,
        timeString,
        timeStringVisual,
        periodName,
        periodDesc,
        isNight,
        dateString: `${monthName} ${date}, ${year}`,
        dateStringVisual: `Mes: ${monthName} | Día: ${date} | Año: ${year}`,
        weatherStringVisual
    };
}

export function advanceTimeBy(timestamp, type, amount) {
    const d = new Date(timestamp);
    if (type === 'minutes') {
        d.setUTCMinutes(d.getUTCMinutes() + amount);
    } else if (type === 'days') {
        d.setUTCDate(d.getUTCDate() + amount);
    } else if (type === 'months') {
        d.setUTCMonth(d.getUTCMonth() + amount);
    } else if (type === 'years') {
        d.setUTCFullYear(d.getUTCFullYear() + amount);
    }
    return d.getTime();
}

export function formatTimePrompt() {
    if (extension_settings.stateTracker?.enableTimeEngine === false) return '';
    
    const data = getCharacterData();
    if (!data || !data.time) return '';

    const timestamp = getTimestamp(data.time);
    
    updateWeatherIfNeeded(data, timestamp);
    
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    const parsed = parseTimestamp(timestamp, data.weather, lang);
    const context = SillyTavern.getContext();
    const charName = context.characterId !== undefined ? context.characters[context.characterId].name : (context.name2 || 'Jane');
    const userName = context.name1 || 'User';
    
    let prompt = isEn ?
        `[Internal Clock: Month: ${parsed.monthName} | Day: ${parsed.date}, ${parsed.dayName} | Year: ${parsed.year} | Time: ${parsed.timeStringVisual} | Phase: ${parsed.periodName}` :
        `[Reloj Interno: Mes: ${parsed.monthName} | Día: ${parsed.date}, ${parsed.dayName} | Año: ${parsed.year} | Hora: ${parsed.timeStringVisual} | Fase: ${parsed.periodName}`;
    
    if (data.weather) {
        prompt += formatWeatherPrompt(data.weather, parsed.isNight);
    }
    
    const ages = calculateAges(timestamp);
    if (ages) {
        if (ages.charAge !== null) prompt += ` | ${charName}_${isEn ? 'age' : 'edad'}: ${ages.charAge}`;
        if (ages.userAge !== null) prompt += ` | ${userName}_${isEn ? 'age' : 'edad'}: ${ages.userAge}`;
    }
    prompt += `]\n`;
    
    const events = getActiveEvents(timestamp);
    let eventStrings = [];
    if (ages && ages.isCharBday) {
        eventStrings.push(isEn ? `Today is ${charName}'s birthday, turning ${ages.charAge}.` : `Hoy es el cumpleaños de ${charName}, cumple ${ages.charAge} años.`);
    }
    if (ages && ages.isUserBday) {
        eventStrings.push(isEn ? `Today is ${userName}'s birthday, turning ${ages.userAge}.` : `Hoy es el cumpleaños de ${userName}, cumple ${ages.userAge} años.`);
    }
    
    events.forEach(e => {
        eventStrings.push(`"${e.name}": ${e.desc}`);
    });
    
    if (eventStrings.length > 0) {
        prompt += isEn ? `[Active Events Today: ${eventStrings.join(' | ')}]\n` : `[Eventos Activos Hoy: ${eventStrings.join(' | ')}]\n`;
    }
    
    return prompt;
}

export function advanceTime(minutesAdded, messageId) {
    if (extension_settings.stateTracker?.enableTimeEngine === false) return;
    
    const data = getCharacterData();
    if (!data || !data.time) return;

    const perTurn = minutesAdded * 60000;
    const idx = (messageId === undefined || messageId === null) ? NaN : Number(messageId);
    
    let recordTs;
    if (Number.isFinite(idx)) {
        // Tiempo determinístico por turno: turno i = base + i*minutosPorTurno.
        // Así, regenerar el mismo mensaje (swipe) siempre vuelve al MISMO instante
        // y nunca infla el reloj.
        recordTs = getBaseTimestamp(data, perTurn) + (idx * perTurn);
    } else {
        recordTs = getTimestamp(data.time);
    }

    data.time.timestamp = recordTs;
    if (data.time.minutes !== undefined) delete data.time.minutes;
    
    console.log(`[StateTracker] Turno ${Number.isFinite(idx) ? idx : '?'}: hora ${new Date(recordTs).toISOString()}`);
    
    updateWeatherIfNeeded(data, recordTs);
    advanceBiology(minutesAdded, data);
    
    saveAndUpdateHUD();
    return recordTs;
}

function getBaseTimestamp(data, perTurn) {
    const context = SillyTavern.getContext();
    const chat = context.chat || [];
    // La base (turno 0) se deriva del snapshot más antiguo que tenga hora.
    // Es inmutable mientras no se edite el turno 0, por lo que cada mensaje
    // posterior siempre cae en su instante exacto con independencia de swipes.
    for (let i = 0; i < chat.length; i++) {
        const snap = chat[i]?.extra?.stateTrackerSnapshot;
        if (snap && snap.time) {
            return getTimestamp(snap.time) - (i * perTurn);
        }
    }
    // Todavía no existe ningún snapshot: el turno actual es la base.
    return data.time.timestamp !== undefined ? data.time.timestamp : getTimestamp(data.time);
}
