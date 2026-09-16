# Extension-StateTracker

A SillyTavern extension designed to inject and track state variables directly within the LLM prompt, providing a real-time visual HUD.

## Features
- **Dynamic HUD:** Visually tracks state variables using customizable progress bars or circular indicators (`conic-gradient` CSS).
- **LLM Integration:** Automatically injects active state variables at the end of the character card.
- **Tag Interception:** Parses LLM responses for the `[UPDATE_STATE: key=value]` technical tag.
- **Self-Cleaning:** Removes the update tag from the final message to prevent polluting the chat/roleplay context.
- **Drag & Drop UI:** Interactive popup menu to manage, reorder, and configure variables visually.

## Architecture (ES6 Modules)
The extension follows the Single Responsibility Principle (SRP):
- `index.js`: Entrypoint. Registers native SillyTavern hooks (`app_ready`, `message_received`, etc.).
- `core/stateManager.js`: Manages the underlying JSON state (`extension_settings.stateTracker.characters`), macro transformation (`{{char}}`), and the update wrapper.
- `core/llmParser.js`: Handles prompt injection (`buildStatePrompt`) and intercepting LLM responses via regular expressions.
- `ui/popupBuilder.js`: Renders the configuration UI, including drag-and-drop sorting and bar settings.
- `ui/hudRenderer.js`: CSS rendering engine for the floating HUD.

## How it works
1. **Injection:** `llmParser.js` injects current variables into the LLM prompt, instructing it to output `[UPDATE_STATE: key=value]` if the state changes.
2. **Interception:** When a message is received, the extension parses it for the technical tag.
3. **Validation:** Prompts the user with a confirmation popup to accept/reject the changes.
4. **Sanitization:** The tag is stripped from `message.mes` immediately, hiding the technical instruction from the final chat log.
