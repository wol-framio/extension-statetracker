import { extension_settings } from '../../../../extensions.js';

export const WEATHER_DICTIONARY = {
    "clear": { name: "Despejado", name_en: "Clear", desc: "Cielo limpio, radiación solar directa.", desc_en: "Clean sky, direct solar radiation.", tempModDay: 4, tempModNight: -2, durationMin: 240, durationMax: 720 },
    "partly_cloudy": { name: "Parcialmente nublado", name_en: "Partly cloudy", desc: "Intervalos de nubes y claros.", desc_en: "Intervals of clouds and clear sky.", tempModDay: 0, tempModNight: 0, durationMin: 120, durationMax: 480 },
    "overcast": { name: "Nublado / Cubierto", name_en: "Overcast", desc: "Cielo cerrado gris.", desc_en: "Closed gray sky.", tempModDay: -2, tempModNight: 2, durationMin: 240, durationMax: 720 },
    "windy": { name: "Viento fuerte / Vendaval", name_en: "Windy / Gale", desc: "Ráfagas considerables sin lluvia.", desc_en: "Considerable gusts without rain.", tempModDay: -3, tempModNight: -3, durationMin: 120, durationMax: 360 },
    "fog": { name: "Niebla densa / Neblina", name_en: "Dense fog", desc: "Humedad alta, visibilidad muy reducida.", desc_en: "High humidity, very reduced visibility.", tempModDay: -2, tempModNight: -2, durationMin: 60, durationMax: 240 },
    
    "drizzle": { name: "Llovizna / Garúa", name_en: "Drizzle", desc: "Precipitación muy fina y persistente.", desc_en: "Very fine and persistent precipitation.", tempModDay: -1, tempModNight: -1, durationMin: 60, durationMax: 300 },
    "rain": { name: "Lluvia moderada", name_en: "Moderate rain", desc: "Lluvia continua estándar.", desc_en: "Standard continuous rain.", tempModDay: -3, tempModNight: -3, durationMin: 120, durationMax: 480 },
    "heavy_rain": { name: "Chubascos / Lluvia torrencial", name_en: "Heavy rain / Showers", desc: "Lluvia intensa que empapa de inmediato.", desc_en: "Intense rain that soaks immediately.", tempModDay: -5, tempModNight: -5, durationMin: 60, durationMax: 180 },
    "thunderstorm": { name: "Tormenta eléctrica", name_en: "Thunderstorm", desc: "Lluvia copiosa acompañada de truenos, rayos y viento cortante.", desc_en: "Heavy rain accompanied by thunder, lightning and sharp wind.", tempModDay: -5, tempModNight: -5, durationMin: 30, durationMax: 120 },
    
    "sleet": { name: "Aguanieve", name_en: "Sleet", desc: "Mezcla de lluvia semiespesa con cristales de hielo.", desc_en: "Mixture of semi-thick rain with ice crystals.", tempModDay: -5, tempModNight: -6, durationMin: 60, durationMax: 240 },
    "hail": { name: "Granizo", name_en: "Hail", desc: "Precipitación violenta de bolas de hielo.", desc_en: "Violent precipitation of ice balls.", tempModDay: -4, tempModNight: -4, durationMin: 15, durationMax: 60 },
    "light_snow": { name: "Nevada suave", name_en: "Light snow", desc: "Copos de nieve moderados.", desc_en: "Moderate snowflakes.", tempModDay: -6, tempModNight: -7, durationMin: 120, durationMax: 480 },
    "heavy_snow": { name: "Nevada intensa", name_en: "Heavy snow", desc: "Caída copiosa de nieve con acumulación rápida.", desc_en: "Heavy snowfall with rapid accumulation.", tempModDay: -10, tempModNight: -10, durationMin: 120, durationMax: 480 },
    "blizzard": { name: "Ventisca / Tormenta de nieve", name_en: "Blizzard", desc: "Vientos huracanados bajo cero y nieve que anulan la visibilidad.", desc_en: "Hurricane-force sub-zero winds and snow that nullify visibility.", tempModDay: -16, tempModNight: -16, durationMin: 120, durationMax: 360 },
    
    "heatwave": { name: "Ola de calor / Sofoco", name_en: "Heatwave", desc: "Radiación sofocante y sequedad extrema.", desc_en: "Suffocating radiation and extreme dryness.", tempModDay: 12, tempModNight: 8, durationMin: 720, durationMax: 2880 },
    "cold_snap": { name: "Ola polar / Helada negra", name_en: "Cold snap", desc: "Caída brusca y letal del mercurio sin precipitación.", desc_en: "Sudden and lethal drop of the thermometer without precipitation.", tempModDay: -14, tempModNight: -14, durationMin: 720, durationMax: 2880 },
    "sandstorm": { name: "Tormenta de arena / Polvo", name_en: "Sandstorm", desc: "Viento abrasador cargado de polvo, calor seco.", desc_en: "Scorching wind loaded with dust, dry heat.", tempModDay: 6, tempModNight: 6, durationMin: 60, durationMax: 240 }
};

export const TEMPERATURE_PRESETS = {
    "muy_frio": { name: "Muy Frío", min: -10, max: 0 },
    "frio": { name: "Frío", min: 0, max: 10 },
    "normal": { name: "Normal", min: 10, max: 22 },
    "caluroso": { name: "Caluroso", min: 22, max: 30 },
    "muy_caluroso": { name: "Muy Caluroso", min: 30, max: 40 }
};

export function initWeatherSettings() {
    if (!extension_settings.stateTracker.weather) {
        extension_settings.stateTracker.weather = {
            enabled: false,
            temperatureEnabled: true,
            tempPreset: "normal",
            probabilities: {}
        };
        for (let key in WEATHER_DICTIONARY) {
            extension_settings.stateTracker.weather.probabilities[key] = { enabled: true, weight: 10 };
        }
        ['heatwave', 'cold_snap', 'sandstorm', 'blizzard', 'thunderstorm'].forEach(k => {
            if (extension_settings.stateTracker.weather.probabilities[k]) {
                extension_settings.stateTracker.weather.probabilities[k].weight = 2;
            }
        });
        ['clear', 'partly_cloudy', 'overcast'].forEach(k => {
            if (extension_settings.stateTracker.weather.probabilities[k]) {
                extension_settings.stateTracker.weather.probabilities[k].weight = 50;
            }
        });
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateWeather(currentTimestamp, forceType = null) {
    const config = extension_settings.stateTracker.weather;
    if (!config || !config.enabled) return null;
    
    let chosenType = "clear";
    
    if (forceType && WEATHER_DICTIONARY[forceType]) {
        chosenType = forceType;
    } else {
        let totalWeight = 0;
        let pool = [];
        for (let key in config.probabilities) {
            const p = config.probabilities[key];
            if (p.enabled && p.weight > 0 && WEATHER_DICTIONARY[key]) {
                totalWeight += p.weight;
                pool.push({ key, weight: p.weight });
            }
        }
        
        if (totalWeight > 0) {
            let roll = getRandomInt(0, totalWeight - 1);
            for (let item of pool) {
                if (roll < item.weight) {
                    chosenType = item.key;
                    break;
                }
                roll -= item.weight;
            }
        }
    }
    
    const weatherDef = WEATHER_DICTIONARY[chosenType];
    const duration = getRandomInt(weatherDef.durationMin, weatherDef.durationMax);
    const expiresAt = currentTimestamp + (duration * 60000);
    
    let tempC = null;
    if (config.temperatureEnabled && TEMPERATURE_PRESETS[config.tempPreset]) {
        const preset = TEMPERATURE_PRESETS[config.tempPreset];
        tempC = getRandomInt(preset.min, preset.max);
    }
    
    return {
        type: chosenType,
        baseTempC: tempC,
        expiresAt: expiresAt
    };
}

export function getCurrentTemperature(weatherState, isNight) {
    if (!weatherState || weatherState.baseTempC === null || weatherState.baseTempC === undefined) return null;
    const def = WEATHER_DICTIONARY[weatherState.type];
    if (!def) return null;
    
    let temp = weatherState.baseTempC;
    if (isNight) {
        temp -= 3;
        temp += def.tempModNight;
    } else {
        temp += def.tempModDay;
    }
    return temp;
}

export function updateWeatherIfNeeded(data, currentTimestamp) {
    const config = extension_settings.stateTracker.weather;
    if (!config || !config.enabled) {
        if (data.weather) delete data.weather;
        return;
    }
    
    if (!data.weather || currentTimestamp >= data.weather.expiresAt) {
        data.weather = generateWeather(currentTimestamp);
    }
}

export function formatWeatherPrompt(weatherState, isNight) {
    if (!weatherState) return "";
    const def = WEATHER_DICTIONARY[weatherState.type];
    if (!def) return "";
    
    const lang = extension_settings.stateTracker?.lang?.prompt || 'en';
    const isEn = lang === 'en';
    
    const wName = isEn && def.name_en ? def.name_en : def.name;
    const wDesc = isEn && def.desc_en ? def.desc_en : def.desc;
    
    let prompt = isEn ? ` | Weather: ${wName}, ${wDesc}` : ` | Clima: ${wName}, ${wDesc}`;
    
    if (weatherState.baseTempC !== null && weatherState.baseTempC !== undefined) {
        prompt += isEn ? ` | Temperature: ${getCurrentTemperature(weatherState, isNight)}°C` : ` | Temperatura: ${getCurrentTemperature(weatherState, isNight)}°C`;
    }
    
    return prompt;
}
