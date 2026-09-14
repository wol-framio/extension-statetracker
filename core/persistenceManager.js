import { getCharacterData, saveAndUpdateHUD } from './stateManager.js';
import { extension_settings } from '../../../../extensions.js';

export async function snapshotStateToMessage(messageId) {
    if (!extension_settings.stateTracker.enabled) return;
    
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0 || !chat[messageId]) return;
    
    const message = chat[messageId];
    if (!message.extra) {
        message.extra = {};
    }
    
    // Perform a deep copy of the current state
    const currentState = getCharacterData();
    message.extra.stateTrackerSnapshot = JSON.parse(JSON.stringify(currentState));
    
    if (context.saveChat) {
        await context.saveChat();
    }
}

export function onMessageDeleted(messageId) {
    if (!extension_settings.stateTracker.enabled) return;
    
    const context = SillyTavern.getContext();
    const chat = context.chat;
    const chatId = context.chatId;
    
    if (!chat || chat.length === 0) return;
    
    // Find the last visible message
    const lastMessage = chat[chat.length - 1];
    
    if (lastMessage && lastMessage.extra && lastMessage.extra.stateTrackerSnapshot) {
        // Restore the state to the snapshot of the last visible message
        if (chatId) {
            extension_settings.stateTracker.chats[chatId] = JSON.parse(JSON.stringify(lastMessage.extra.stateTrackerSnapshot));
            saveAndUpdateHUD();
            toastr.info("State reverted to match the last visible message.", "State Tracker");
        }
    }
}

export function onMessageSwiped(messageId) {
    if (!extension_settings.stateTracker.enabled) return;
    
    const context = SillyTavern.getContext();
    const chat = context.chat;
    const chatId = context.chatId;
    
    if (!chat || !chatId) return;
    
    // When swiping, we need to revert the state to the message BEFORE the current one
    // to block logical mutations from carrying over to the new generation.
    const prevMessageIndex = messageId - 1;
    if (prevMessageIndex >= 0 && chat[prevMessageIndex]) {
        const prevMessage = chat[prevMessageIndex];
        if (prevMessage.extra && prevMessage.extra.stateTrackerSnapshot) {
            extension_settings.stateTracker.chats[chatId] = JSON.parse(JSON.stringify(prevMessage.extra.stateTrackerSnapshot));
            saveAndUpdateHUD();
            console.log("[StateTracker] Reverted state for swipe regeneration.");
        }
    }
}
