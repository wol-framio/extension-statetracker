import { extension_settings } from '../../../extensions.js';
import { saveAndUpdateHUD } from './core/stateManager.js';
import { updateHUD } from './ui/hudRenderer.js';
import { onGenerateBeforeCombinePrompts, onChatCompletionPromptReady, onMessageReceived } from './core/llmParser.js';
import { showQuickStatePopup } from './ui/popupBuilder.js';

if (!extension_settings.stateTracker) {
    extension_settings.stateTracker = {
        enabled: true,
        characters: {}, // Keyed by character avatar (legacy/fallback)
        chats: {},      // Keyed by chatId (per session)
        presets: {},    // Keyed by preset name
        customPrompt: "" // Custom LLM instructions
    };
}

if (!extension_settings.stateTracker.chats) {
    extension_settings.stateTracker.chats = {};
}

// Ensure presets structure exists
if (!extension_settings.stateTracker.presets) {
    extension_settings.stateTracker.presets = {};
}

// Add a default template to the presets if empty
if (Object.keys(extension_settings.stateTracker.presets).length === 0) {
    extension_settings.stateTracker.presets["Default RPG Roleplay"] = [
        {
            name: "General",
            hidden: false,
            collapsed: false,
            variables: {
                "location_world": "Earth",
                "location_region": "Tokyo, Japan (Setagaya)",
                "location_room": "Bedroom",
                "chronos_date": "10/13/2022",
                "chronos_day": "Friday",
                "chronos_time": "23:55",
                "chronos_weather": "Clear night"
            }
        },
        {
            name: "Apariencia y Posición",
            hidden: false,
            collapsed: false,
            variables: {
                "{{char}}_age": "29",
                "{{user}}_age": "27",
                "{{char}}_outfit": "Underwear",
                "{{user}}_outfit": "Underwear",
                "{{char}}_position": "Lying on bed",
                "{{user}}_position": "Standing near bed",
                "{{char}}_appearance": "Blushing slightly",
                "{{user}}_appearance": "Sweating"
            }
        },
        {
            name: "Inventario y Dinero",
            hidden: false,
            collapsed: false,
            variables: {
                "{{char}}_money": "100",
                "{{user}}_money": "50",
                "env_objects": "King bed, white sheets, night lamp",
                "env_characters": "No secondary characters"
            }
        }
    ];
}

const STYLE_ID = 'state-tracker-styles';

function renderSettings() {
    $('#state_tracker_enabled').prop('checked', extension_settings.stateTracker.enabled);
}

function setupUIHandlers() {
    $('#state_tracker_enabled').off('change').on('change', function() {
        extension_settings.stateTracker.enabled = $(this).prop('checked');
        saveAndUpdateHUD();
    });
}

jQuery(() => {
    // 1. Append settings drawer
    const settingsContainer = $(document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings'));
    if (settingsContainer.length > 0) {
        const html = `
            <div class="state_tracker_settings" style="margin-bottom: 20px;">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>State & Variables Tracker</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display: none; padding: 10px;">
                        <div style="margin-bottom: 10px; font-size: 0.95em; opacity: 0.9;">
                            Allows creating and tracking custom key-value variables (such as location, outfits, physical positions, appearance, money, and time). The LLM can write updates dynamically.
                        </div>
                        <label for="state_tracker_enabled" class="checkbox_label" style="display: flex; align-items: center; cursor: pointer; font-weight: bold; margin-bottom: 15px;">
                            <input type="checkbox" id="state_tracker_enabled" name="state_tracker_enabled" style="margin-right: 8px;">
                            Enable State & Variables Tracking
                        </label>
                    </div>
                </div>
            </div>
        `;
        settingsContainer.append(html);
    }

    // 2. Append quick access option to the Hamburger Menu (three stacked lines)
    const quickOption = $(`
        <a id="option_state_tracker" style="cursor: pointer;">
            <i class="fa-lg fa-solid fa-sliders"></i>
            <span data-i18n="State Tracker">State Tracker</span>
        </a>
    `);
    quickOption.on('click', function() {
        $('#options').hide();
        showQuickStatePopup();
    });
    $('#options .options-content').append(quickOption);

    // Setup handlers and render
    renderSettings();
    setupUIHandlers();

    // Register event listeners
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onGenerateBeforeCombinePrompts);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, updateHUD);
}
);

setTimeout(updateHUD, 2000); // Initial load
