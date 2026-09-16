import { getCharacterData } from '../core/stateManager.js';
import { extension_settings } from '../../../../extensions.js';

export function initHUD() {
    if ($('#state-tracker-hud').length === 0) {
        const hud = $('<div id="state-tracker-hud" class="st-hud-container"></div>');
        $('body').append(hud);
    }
}

export function updateHUD() {
    initHUD();
    const hud = $('#state-tracker-hud');
    
    if (!extension_settings.stateTracker.enabled) {
        hud.hide();
        return;
    }

    const lastCharMes = $('.mes[is_system="false"][is_user="false"]').last();
    if (lastCharMes.length) {
        lastCharMes.find('.mesAvatarWrapper').append(hud);
        hud.show();
    } else {
        hud.hide();
        return;
    }
    
    const data = getCharacterData();
    if (!data || !data.groups) {
        hud.empty();
        return;
    }

    // Keep track of which bars are currently active to clean up removed ones
    const activeKeys = new Set();

    data.groups.forEach(group => {
        if (!group.bars) return;
        
        Object.keys(group.variables).forEach(key => {
            const barConf = group.bars[key];
            if (!barConf || !barConf.enabled) return;
            
            const rawVal = parseFloat(group.variables[key]) || 0;
            const maxVal = parseFloat(barConf.max) || 100;
            const percentage = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
            
            const labelText = barConf.label ? String(barConf.label) : '';
            const displayVal = barConf.valueType === 'percentage' ? `${Math.round(percentage)}%` : `${rawVal}/${maxVal}`;
            
            const elementId = `st-bar-${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
            activeKeys.add(elementId);
            
            let existingBar = hud.find(`#${elementId}`);
            
            if (existingBar.length === 0) {
                // Create DOM if not exists
                const barHtml = `
                    <div id="${elementId}" class="st-hud-bar-wrapper">
                        <div class="st-hud-label st-hud-above"></div>
                        <div class="st-hud-text st-hud-above"></div>
                        
                        <div class="st-hud-shape-container">
                            <div class="st-hud-fill"></div>
                            <div class="st-hud-inside-wrapper">
                                <span class="st-hud-label-inside"></span>
                                <div class="st-hud-text st-hud-inside"></div>
                            </div>
                        </div>
                        
                        <div class="st-hud-label st-hud-below"></div>
                        <div class="st-hud-text st-hud-below"></div>
                    </div>
                `;
                existingBar = $(barHtml);
                hud.append(existingBar);
            }
            
            // Hydrate properties
            existingBar.find('.st-hud-text').text(displayVal);
            existingBar.find('.st-hud-label').text(labelText);
            existingBar.find('.st-hud-label-inside').text(labelText);
            
            // Hide/Show elements based on position
            existingBar.find('.st-hud-above, .st-hud-below, .st-hud-inside, .st-hud-label-inside').hide();
            
            if (barConf.textPos === 'above') {
                existingBar.find('div.st-hud-label.st-hud-above, div.st-hud-text.st-hud-above').css('display', 'block');
            } else if (barConf.textPos === 'below') {
                existingBar.find('div.st-hud-label.st-hud-below, div.st-hud-text.st-hud-below').css('display', 'block');
            } else if (barConf.textPos === 'inside') {
                existingBar.find('.st-hud-inside-wrapper').css('display', 'flex');
                existingBar.find('div.st-hud-text.st-hud-inside').css('display', 'block');
                if (labelText) existingBar.find('.st-hud-label-inside').css('display', 'block');
            }

            const shapeContainer = existingBar.find('.st-hud-shape-container');
            const fill = existingBar.find('.st-hud-fill');

            // Apply Shape and Colors
            shapeContainer.css({
                'background': barConf.colorBg,
                'border-color': barConf.colorBorder
            });

            if (barConf.shape === 'circle') {
                shapeContainer.attr('class', 'st-hud-shape-container st-hud-circle');
                shapeContainer.css('background', `conic-gradient(${barConf.colorFill} ${percentage}%, ${barConf.colorBg} ${percentage}%)`);
                fill.hide();
            } else {
                shapeContainer.attr('class', 'st-hud-shape-container st-hud-bar');
                if (barConf.shape === 'rounded-bar') shapeContainer.css('border-radius', '4px');
                else shapeContainer.css('border-radius', '0px');
                
                fill.show().css('background', barConf.colorFill);
                if (barConf.fillDir === 'bottom-to-top') {
                    fill.css({ 'width': '100%', 'height': `${percentage}%`, 'bottom': '0', 'left': 'auto' });
                } else {
                    fill.css({ 'height': '100%', 'width': `${percentage}%`, 'left': '0', 'bottom': 'auto' });
                }
            }
        });
    });

    // Remove old bars that are no longer active
    hud.children('.st-hud-bar-wrapper').each(function() {
        if (!activeKeys.has(this.id)) {
            $(this).remove();
        }
    });
}
