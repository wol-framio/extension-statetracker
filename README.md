# SillyTavern State Tracker

**State Tracker** es una extensión avanzada y de arquitectura modular para SillyTavern que introduce físicas, simulación temporal, mecánicas biológicas y gestión de inventarios dentro de tus sesiones de rol. Está diseñada para operar silenciosamente en segundo plano, manteniendo un estado interno persistente y consistente del mundo y de los personajes, liberando al LLM principal de la carga cognitiva de recordar variables finas.

## Características Principales

### ⏱️ Motor de Tiempo (Time Engine)
Mantiene un flujo temporal realista a lo largo del chat.
- Seguimiento preciso de Fecha, Hora, Mes y Año.
- Cálculo automático de edades y detección de cumpleaños de los personajes.
- Procesamiento en segundo plano del tiempo transcurrido entre mensajes.

### 🌤️ Motor de Clima (Weather Engine)
Simula condiciones atmosféricas dinámicas basadas en la época del año.
- Temperatura y fenómenos climáticos adaptativos.
- Inyección directa del clima actual en el contexto del LLM.

### 🧬 Motor Biológico (Biology Engine)
Un simulador de supervivencia y necesidades corporales. Rastrea variables críticas con decaimiento por turnos:
- Hambre, Sed, Fatiga y Vejiga/Intestinos.
- Higiene y estado de embarazo.
- Interacción a través de etiquetas nativas de eventos anatómicos (Ej. `[EVENT: ate_food]`, `[EVENT: slept_deep]`).

### 👗 Gestor de Armario (Clothing Engine)
Un sistema de inventario de ranuras (slots) basado en físicas corporales (cabeza, torso, piernas, accesorios).
- Detecta colisiones: equipar una prenda reemplaza automáticamente otra en la misma ranura.
- Soporte para Conjuntos (Outfits) predefinidos.
- Analizador de anatomía expuesta (detecta si el personaje está desnudo o qué partes son visibles).
- Manipulación nativa mediante etiquetas: `[EQUIP: id]`, `[UNEQUIP: id]`, `[OUTFIT: id]`.

### 📊 Grupos y Variables Personalizadas
Permite crear y rastrear métricas específicas del rol (Afecto, Corrupción, Dinero, Salud, etc.).
- Categorización visual y capacidad de ocultar/mostrar grupos al vuelo.

### 🤖 Motor Tiny LLM (Interceptor y Gestor de Estado)
La joya de la corona en eficiencia. En lugar de usar tu LLM Principal (caro y pesado) para parsear el estado del mundo, State Tracker delega esta tarea a un **Tiny LLM** (una API secundaria más rápida/barata).
- **Extracción Silenciosa:** Analiza el turno actual y extrae qué variables cambiaron.
- **Protocolo de Tags:** Convierte las acciones narrativas en directivas lógicas (`[EQUIP]`, `[EVENT]`).
- **Interceptor Visual (Debug):** Una interfaz gráfica flotante (Checkboxes) que intercepta la respuesta del Tiny LLM antes de aplicarla. Te permite aceptar, rechazar o auditar modificaciones, e incluye una consola RAW para depurar las respuestas crudas de la API.

---

## Cómo Funciona (Flujo Interno)

1. **Inyección de Contexto:** Al enviar un mensaje, State Tracker inyecta silenciosamente las variables actuales (Ropa, Biología, Tiempo) en la cima de tu bloque de sistema (`[STATE]`).
2. **Generación del LLM Principal:** Tu LLM primario genera la respuesta narrativa de rol basándose en las físicas y ropa actuales, sin preocuparse de modificar JSONs matemáticos.
3. **Pase del Tiny LLM:** Opcionalmente en modo automático, o mediante el botón de "Actualización Manual", el Tiny LLM escanea el último mensaje para detectar cambios lógicos en la narrativa (ej. "se quitó la chaqueta y se comió una manzana").
4. **Interceptación (UI):** El sistema captura el output, purga los datos redundantes y te muestra un panel para confirmar los cambios.
5. **Aplicación Delta:** Si lo apruebas, los motores internos modifican matemáticamente las variables (procesando colisiones de inventario, decaimientos biológicos o deltas matemáticos) y se actualiza el HUD.

---

## Notas de Desarrollo
- La extensión utiliza un sistema de inyección Reactivo por Placeholders (`{{rule_clothing}}`, `{{rule_biology}}`) para estructurar los prompts. Si deshabilitas un sistema (ej. el clima), la extensión purga activamente las reglas de ese sistema del prompt antes de tocar la API, garantizando **0 desperdicio de tokens**.
- Diseñada con resistencia a alucinaciones. El código intercepta respuestas redundantes y fuerza al modelo a usar deltas para mayor seguridad del estado.

---

## Sistema Nativo de Etiquetas (Main LLM)

Si decides no usar el motor **Tiny LLM** en segundo plano, o si prefieres que tu **LLM Principal** interactúe de forma explícita y visible con el entorno, State Tracker incluye un motor de expresiones regulares (RegEx) incrustado en el parser del chat. El modelo principal puede modificar el estado subyacente de la partida simplemente escupiendo estas etiquetas estructurales estrictamente al **final de su respuesta**:

### 1. Etiquetas de Ropa (Wardrobe)
Modifican el inventario de vestimenta resolviendo automáticamente colisiones corporales (Slots).
- **Equipar:** `[EQUIP: item_id]`
- **Desequipar:** `[UNEQUIP: item_id]`
*Nota del Sistema inyectada al LLM:* `To interact with clothing, strictly output tags at the end of your response. To put on an item: [EQUIP: item_id]. To take off an item: [UNEQUIP: item_id]. These tags modify the inventory state seamlessly.`

### 2. Etiquetas de Actualización de Estado (Custom Variables)
Actualiza variables personalizadas (Grupos) sin usar JSON (formato heredado/ligero).
- **Sintaxis Pipeline:** `[UPDATE_STATE: key_name=value | another_key=value2]`
*Ejemplo:* `[UPDATE_STATE: location_room=Kitchen | nearby_npcs=none]`
*Nota del Sistema inyectada al LLM:* `To update any variable when the scene, time, clothes, positions, money, or state changes, you MUST append a tag at the very end of your response: [UPDATE_STATE: key_name=value | another_key=value2]. Update only the keys that changed. Unchanged keys preserve their values.`
