import { extension_settings } from '../../../../extensions.js';

function renderSnapshotModal(mesId, message) {
    const { Popup } = SillyTavern.getContext();
    const snapshot = message.extra.stateTrackerSnapshot;
    
    // Format JSON safely and filter out internal config/CSS
    let cleanSnapshot = {};
    try {
        if (snapshot && snapshot.groups) {
            snapshot.groups.forEach(group => {
                cleanSnapshot[group.name] = group.variables;
            });
        } else {
            cleanSnapshot = snapshot;
        }
        formatted = JSON.stringify(cleanSnapshot, null, 2);
    } catch (e) {
        formatted = "Error parsing snapshot data.";
    }

    const html = `
        <div style="text-align: left; font-size: 0.9em; margin-top: 10px;">
            <div style="margin-bottom: 10px; color: #aaa;">This is the exact logical state frozen in time at this specific message turn.</div>
            <pre style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px; border: 1px solid #444; max-height: 50vh; overflow-y: auto; white-space: pre-wrap; font-family: monospace;">${formatted}</pre>
        </div>
    `;
    Popup.show.text(`State Snapshot (Turn ${mesId})`, html);
}

export function initMetadataViewer() {
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    // MutationObserver to catch messages as they render or re-render
    const observer = new MutationObserver((mutations) => {
        if (!extension_settings.stateTracker.enabled) return;
        
        const context = SillyTavern.getContext();
        if (!context || !context.chat) return;

        let requiresInjection = false;
        mutations.forEach(m => {
            if (m.addedNodes.length > 0) requiresInjection = true;
        });

        if (requiresInjection) {
            $('.mes').each(function() {
                const mesEl = $(this);
                const mesId = mesEl.attr('mesid');
                if (mesId == null) return;
                
                const message = context.chat[mesId];
                if (!message || !message.extra || !message.extra.stateTrackerSnapshot) return;

                // Ensure button doesn't exist yet
                if (mesEl.find('.state-meta-btn').length === 0) {
                    // Create an unobtrusive button (microchip icon) to inject in the message header/buttons
                    const btn = $(`
                        <div class="mes_button state-meta-btn" title="View State Snapshot" style="cursor: pointer; opacity: 0.6; display: inline-block; margin-left: 5px;">
                            <i class="fa-solid fa-microchip"></i>
                        </div>
                    `);
                    
                    btn.on('click', (e) => {
                        e.stopPropagation();
                        renderSnapshotModal(mesId, message);
                    });
                    
                    // Injecting into the standard .mes_buttons container
                    const btnContainer = mesEl.find('.mes_buttons');
                    if (btnContainer.length > 0) {
                        btnContainer.prepend(btn);
                    }
                }
            });
        }
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
}
