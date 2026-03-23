import { MODULE } from "../scene/constants.js";

export function initUI(state) {
  const ui = document.getElementById("ui");
  ui.innerHTML = `
    <div class="ui-header">
      <div><b>MVP макет</b> (6×9 поле, склады по бокам, зоны загрузки/выгрузки)</div>
      <button id="edit-mode-toggle" type="button" class="mode-toggle"></button>
    </div>
    <div class="row">ПКМ по ячейке: выделить для редактирования</div>
    <div class="row">ЛКМ по выделенной ячейке: <kbd>Пусто</kbd> → <kbd>Конвейер</kbd> → <kbd>Поворотный</kbd> → <kbd>Обработка</kbd> → …</div>
    <div class="row">Выделенная ячейка: <kbd>R</kbd> повернуть (конвейер/поворотный), <kbd>Del</kbd> очистить</div>
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
    <div class="row">Кран: <kbd>Q</kbd>/<kbd>E</kbd> лев/прав стеллаж, <kbd>W/S</kbd> вверх/вниз, <kbd>A/D</kbd> влево/вправо, <kbd>F</kbd> взять/положить со стеллажа, <kbd>G</kbd> обмен с IO-стеком</div>
    <div class="row">Объект на поле: <kbd>←↑→↓</kbd> перемещение по ячейкам; из соседней с IO ячейки выведите его за границу поля, чтобы вернуть в стопку снизу</div>
    <div class="row muted">Вне режима редактирования локальные действия отключены: остаётся только удалённое управление через API.</div>
  `;

  const toggle = ui.querySelector("#edit-mode-toggle");

  const stackCapacityInput = ui.querySelector("#stack-capacity");
  const leftZoneButton = ui.querySelector("#io-zone-left");
  const rightZoneButton = ui.querySelector("#io-zone-right");
  const launchButton = ui.querySelector("#io-zone-launch");

  function renderToggle() {
    toggle.textContent = state.editMode ? "Режим редактирования: ВКЛ" : "Режим редактирования: ВЫКЛ";
    toggle.classList.toggle("active", state.editMode);
    stackCapacityInput.value = String(state.stackCapacity);
    leftZoneButton.classList.toggle("active", state.activeIOZone === "left");
    rightZoneButton.classList.toggle("active", state.activeIOZone === "right");
    launchButton.disabled = !state.editMode;
  }

  toggle.addEventListener("click", () => {
    state.editMode = !state.editMode;
    renderToggle();
  });

  leftZoneButton.addEventListener("click", () => {
    state.activeIOZone = "left";
    renderToggle();
  });

  rightZoneButton.addEventListener("click", () => {
    state.activeIOZone = "right";
    renderToggle();
  });

  launchButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("io-launch-request"));
  });

  stackCapacityInput.addEventListener("change", () => {
    const nextCapacity = Number(stackCapacityInput.value);
    const currentMax = Math.max(state.ioStacks.left.length, state.ioStacks.right.length, 1);
    state.stackCapacity = Math.max(currentMax, Math.min(12, Math.floor(nextCapacity || currentMax)));
    renderToggle();
  });

  renderToggle();
}

export function updateHUD(state, cranes) {
  const hud = document.getElementById("hud");
  const { r, c } = state.selectedCell;
  const cs = state.cellState[r][c];
  const crane = cranes[state.activeCraneKey];

  const dir = ["N","E","S","W"][cs.dir];
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
crane pose: row=${crane.row} level=${crane.level} holding=${crane.holding ? ("obj#"+crane.holding.id) : "-"}

active io zone: ${state.activeIOZone}
field object: ${state.activeFieldObject ? `obj#${state.activeFieldObject.id}` : "-"}
stack capacity: ${state.stackCapacity}
io left: ${state.ioStacks.left.map(o => o.id).join(", ") || "-"}
io right: ${state.ioStacks.right.map(o => o.id).join(", ") || "-"}
objects total: ${state.objects.size}`;
}
