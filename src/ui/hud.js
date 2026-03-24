import { MODULE } from "../scene/constants.js";

export function initUI(state, actions) {
  const ui = document.getElementById("ui");
  ui.innerHTML = `
    <div class="panel-shell">
      <div class="ui-header">
        <div class="ui-title-block">
          <div class="ui-title">Макет гибкой производственной линии</div>
        </div>
        <button id="edit-mode-toggle" type="button" class="mode-toggle"></button>
      </div>

      <section class="ui-card">
        <div class="section-title">Редактирование</div>
        <div class="tip-list">
          <div class="tip-item"><span class="tip-label tip-label-edit">ПКМ</span><span>выбрать ячейку</span></div>
          <div class="tip-item"><span class="tip-label tip-label-edit">ЛКМ</span><span>сменить модуль</span></div>
        </div>
        <div class="module-flow">
          <span class="module-pill">Пусто</span>
          <span class="flow-arrow">→</span>
          <span class="module-pill module-conveyor">Конвейер</span>
          <span class="flow-arrow">→</span>
          <span class="module-pill module-rotary">Поворот</span>
          <span class="flow-arrow">→</span>
          <span class="module-pill module-process">Обработка</span>
        </div>
        <div class="hotkey-list compact-list">
          <div class="hotkey-item">
            <div class="hotkey-keys"><kbd>R</kbd></div>
            <div class="hotkey-desc">поворот модуля</div>
          </div>
          <div class="hotkey-item">
            <div class="hotkey-keys"><kbd>Del</kbd></div>
            <div class="hotkey-desc">очистка ячейки</div>
          </div>
        </div>
      </section>

      <section class="ui-card">
        <div class="section-title">API-клавиши</div>
        <div class="hotkey-list compact-list">
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>Q</kbd><kbd>E</kbd></div><div class="hotkey-desc">выбрать кран</div></div>
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>A</kbd><kbd>D</kbd></div><div class="hotkey-desc">по рядам</div></div>
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>W</kbd><kbd>S</kbd></div><div class="hotkey-desc">по уровням</div></div>
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>F</kbd></div><div class="hotkey-desc">забрать/положить на стеллаж</div></div>
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>G</kbd></div><div class="hotkey-desc">забрать/положить в зону загрузки/выгрузки</div></div>
          <div class="hotkey-item"><div class="hotkey-keys"><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd></div><div class="hotkey-desc">объект на поле</div></div>
        </div>
      </section>

      <section class="ui-card ui-controls-card">
        <div class="field-group">
          <label for="stack-capacity">Объем зоны загрузки/выгрузки</label>
          <input id="stack-capacity" type="number" min="1" max="12" step="1" />
        </div>
        <div class="field-group">
          <div class="field-label">Активная зона загрузки/выгрузки</div>
          <div class="ui-zone-controls">
            <button id="io-zone-left" type="button">Левая</button>
            <button id="io-zone-right" type="button">Правая</button>
            <button id="io-zone-launch" type="button" class="launch-button">Объект на поле</button>
          </div>
        </div>
      </section>

      <div class="ui-note">
        В режиме API вся логика идет через FastAPI.
      </div>
    </div>
  `;

  const toggle = ui.querySelector("#edit-mode-toggle");
  const stackCapacityInput = ui.querySelector("#stack-capacity");
  const leftZoneButton = ui.querySelector("#io-zone-left");
  const rightZoneButton = ui.querySelector("#io-zone-right");
  const launchButton = ui.querySelector("#io-zone-launch");

  function renderControls() {
    const remoteDisabled = !state.editMode || state.apiBusy;

    toggle.textContent = state.editMode ? "Edit\nON" : "Edit\nOFF";
    toggle.classList.toggle("active", state.editMode);
    toggle.disabled = !!state.apiBusy;

    stackCapacityInput.value = String(state.stackCapacity);
    stackCapacityInput.disabled = remoteDisabled;

    leftZoneButton.classList.toggle("active", state.activeIOZone === "left");
    rightZoneButton.classList.toggle("active", state.activeIOZone === "right");
    leftZoneButton.disabled = remoteDisabled;
    rightZoneButton.disabled = remoteDisabled;
    launchButton.disabled = remoteDisabled;
  }

  toggle.addEventListener("click", async () => {
    await actions.onToggleEditMode?.();
  });

  leftZoneButton.addEventListener("click", async () => {
    if (state.editMode) {
      state.activeIOZone = "left";
      state.renderUI?.();
      return;
    }
    await actions.onSelectIOZone?.("left");
  });

  rightZoneButton.addEventListener("click", async () => {
    if (state.editMode) {
      state.activeIOZone = "right";
      state.renderUI?.();
      return;
    }
    await actions.onSelectIOZone?.("right");
  });

  launchButton.addEventListener("click", async () => {
    if (state.editMode) {
      window.dispatchEvent(new CustomEvent("io-launch-request"));
      return;
    }
    await actions.onLaunchIO?.();
  });

  stackCapacityInput.addEventListener("change", async () => {
    if (state.editMode) {
      const nextCapacity = Number(stackCapacityInput.value);
      const currentMax = Math.max(state.ioStacks.left.length, state.ioStacks.right.length, 1);
      state.stackCapacity = Math.max(currentMax, Math.min(12, Math.floor(nextCapacity || currentMax)));
      state.renderUI?.();
      return;
    }
    await actions.onSetStackCapacity?.(Number(stackCapacityInput.value));
  });

  state.renderUI = renderControls;
  renderControls();
}

export function updateHUD(state, cranes) {
  const hud = document.getElementById("hud");
  if (!hud) return;

  const { r, c } = state.selectedCell;
  const cs = state.cellState[r][c];
  const crane = cranes[state.activeCraneKey];

  const dir = ["N", "E", "S", "W"][cs.dir];
  const occ = cs.occupiedBy ? `obj#${cs.occupiedBy.id}` : "-";
  const cellLine =
    cs.type === MODULE.ROTARY ? `${cs.type} ${dir}` :
    cs.type === MODULE.PROCESS ? `${cs.type} q=${cs.queue.length}` :
    cs.type === MODULE.CONVEYOR ? `${cs.type}` :
    "empty";

  hud.textContent =
`mode: ${state.editMode ? "edit" : "api"}
cell: r${r} c${c}
module: ${cellLine}
occ: ${occ}

crane: ${state.activeCraneKey}
pose: r${crane.row} l${crane.level}
hold: ${crane.holding ? `obj#${crane.holding.id}` : "-"}

io: ${state.activeIOZone}
field: ${state.activeFieldObject ? `obj#${state.activeFieldObject.id}` : "-"}
stack: ${state.stackCapacity}
left: ${state.ioStacks.left.map((o) => o.id).join(", ") || "-"}
right: ${state.ioStacks.right.map((o) => o.id).join(", ") || "-"}
objects: ${state.objects.size}
api: ${state.apiBusy ? "busy" : "ready"}
error: ${state.apiError || "-"}`;
}
