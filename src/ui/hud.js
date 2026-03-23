import { MODULE } from "../scene/constants.js";

export function initUI(state, actions) {
  const ui = document.getElementById("ui");
  ui.innerHTML = `
    <div class="ui-header">
      <div><b>MVP макет</b> (6x9 поле, склады по бокам, зоны загрузки/выгрузки)</div>
      <button id="edit-mode-toggle" type="button" class="mode-toggle"></button>
    </div>
    <div class="row">ПКМ по ячейке: выделить для редактирования</div>
    <div class="row">ЛКМ по выделенной ячейке: <kbd>Пусто</kbd> -> <kbd>Конвейер</kbd> -> <kbd>Поворотный</kbd> -> <kbd>Обработка</kbd> -> ...</div>
    <div class="row">Редактирование: <kbd>R</kbd> повернуть модуль, <kbd>Del</kbd> очистить ячейку</div>
    <div class="row">API-управление: <kbd>Q/E</kbd> выбрать кран, <kbd>W/S</kbd> переместить по рядам, <kbd>A/D</kbd> по уровням, <kbd>F</kbd> склад, <kbd>G</kbd> IO, стрелки для объекта на поле</div>
    <div class="row ui-stack-controls">
      <label for="stack-capacity">Размер стопки</label>
      <input id="stack-capacity" type="number" min="1" max="12" step="1" />
    </div>
    <div class="row ui-zone-controls">
      <span>Активная зона IO</span>
      <button id="io-zone-left" type="button">Левая</button>
      <button id="io-zone-right" type="button">Правая</button>
      <button id="io-zone-launch" type="button">Нижний на поле</button>
    </div>
    <div class="row muted">Операционные действия доступны только в режиме API. При выходе из edit-режима текущая раскладка поля синхронизируется с FastAPI.</div>
  `;

  const toggle = ui.querySelector("#edit-mode-toggle");
  const stackCapacityInput = ui.querySelector("#stack-capacity");
  const leftZoneButton = ui.querySelector("#io-zone-left");
  const rightZoneButton = ui.querySelector("#io-zone-right");
  const launchButton = ui.querySelector("#io-zone-launch");

  function renderControls() {
    const remoteDisabled = state.editMode || state.apiBusy;

    toggle.textContent = state.editMode ? "Режим редактирования: ВКЛ" : "Режим редактирования: ВЫКЛ";
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
    await actions.onSelectIOZone?.("left");
  });

  rightZoneButton.addEventListener("click", async () => {
    await actions.onSelectIOZone?.("right");
  });

  launchButton.addEventListener("click", async () => {
    await actions.onLaunchIO?.();
  });

  stackCapacityInput.addEventListener("change", async () => {
    await actions.onSetStackCapacity?.(Number(stackCapacityInput.value));
  });

  state.renderUI = renderControls;
  renderControls();
}

export function updateHUD(state, cranes) {
  const hud = document.getElementById("hud");
  const { r, c } = state.selectedCell;
  const cs = state.cellState[r][c];
  const crane = cranes[state.activeCraneKey];

  const dir = ["N", "E", "S", "W"][cs.dir];
  const occ = cs.occupiedBy ? `obj#${cs.occupiedBy.id}` : "-";
  const cellLine =
    cs.type === MODULE.ROTARY ? `${cs.type} dir=${dir} occ=${occ}` :
    cs.type === MODULE.PROCESS ? `${cs.type} q=${cs.queue.length} busyUntil=${cs.busyUntil.toFixed(1)} occ=${occ}` :
    cs.type === MODULE.CONVEYOR ? `${cs.type} occ=${occ}` :
    "empty";

  hud.textContent =
`mode: ${state.editMode ? "edit" : "api"}
selected cell: r=${r} c=${c}
cell state: ${cellLine}

active crane: ${state.activeCraneKey}
crane pose: row=${crane.row} level=${crane.level} holding=${crane.holding ? ("obj#" + crane.holding.id) : "-"}

active io zone: ${state.activeIOZone}
field object: ${state.activeFieldObject ? `obj#${state.activeFieldObject.id}` : "-"}
stack capacity: ${state.stackCapacity}
io left: ${state.ioStacks.left.map((o) => o.id).join(", ") || "-"}
io right: ${state.ioStacks.right.map((o) => o.id).join(", ") || "-"}
objects total: ${state.objects.size}
api busy: ${state.apiBusy ? "yes" : "no"}
api error: ${state.apiError || "-"}`;
}
