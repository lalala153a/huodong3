const CONFIG = {
  rows: 4,
  cols: 4,
  startPlayer: { row: 3, col: 0, team: "red", tilt: -2 },
  startBall: { row: 3, col: 0 },
  goalCell: { row: 0, col: 3 },
  blockers: [],
  emptyMessage: "记录框还是空的，先点一下方向箭头。",
  readyMessage: "点击右侧方向箭头，足球会立即移动。",
  resetMessage: "已重置，继续从左下角开始。",
  goalMessage: "进球成功，点击重置可以再来一次。",
};

const DIRECTION_DEFS = [
  { id: "up-left", label: "左上", deltaRow: -1, deltaCol: -1, rotation: -135, slot: 1, symbol: "↖" },
  { id: "up", label: "向上", deltaRow: -1, deltaCol: 0, rotation: -90, slot: 2, symbol: "↑" },
  { id: "up-right", label: "右上", deltaRow: -1, deltaCol: 1, rotation: -45, slot: 3, symbol: "↗" },
  { id: "left", label: "向左", deltaRow: 0, deltaCol: -1, rotation: 180, slot: 4, symbol: "←" },
  { id: "right", label: "向右", deltaRow: 0, deltaCol: 1, rotation: 0, slot: 6, symbol: "→" },
  { id: "down-left", label: "左下", deltaRow: 1, deltaCol: -1, rotation: 135, slot: 7, symbol: "↙" },
  { id: "down", label: "向下", deltaRow: 1, deltaCol: 0, rotation: 90, slot: 8, symbol: "↓" },
  { id: "down-right", label: "右下", deltaRow: 1, deltaCol: 1, rotation: 45, slot: 9, symbol: "↘" },
];

const obstacleKeys = new Set(CONFIG.blockers.map((item) => `${item.row}-${item.col}`));

const state = {
  ball: { ...CONFIG.startBall },
  path: [{ ...CONFIG.startBall }],
  moves: [],
  steps: 0,
  completed: false,
};

const elements = {
  board: document.getElementById("board"),
  ball: document.getElementById("ball"),
  controlsGrid: document.getElementById("controlsGrid"),
  moveLog: document.getElementById("moveLog"),
  stepCount: document.getElementById("stepCount"),
  resetButton: document.getElementById("resetButton"),
  statusText: document.getElementById("statusText"),
  pathOverlay: document.getElementById("pathOverlay"),
  pathLineShadow: document.getElementById("pathLineShadow"),
  pathLine: document.getElementById("pathLine"),
};

function createArrowSvg(rotation) {
  return `
    <svg viewBox="0 0 40 40" class="arrow-icon" style="--rotation:${rotation}deg" aria-hidden="true" focusable="false">
      <path d="M4 13.5h18V6l13 10.5L22 27v-7.5H4z"></path>
    </svg>
  `;
}

function createPlayerMarkup(team) {
  const asset = team === "red" ? "../images/red-player-cutout.png" : "../images/blue-player-cutout.png";

  return `<img src="${asset}" alt="">`;
}

function createGoalMarkup() {
  return `
    <div class="goal-art" aria-hidden="true">
      <img src="../images/goal-net-cutout.png" alt="">
    </div>
  `;
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function updateStats() {
  elements.stepCount.textContent = String(state.steps);
}

function getCell(row, col) {
  return elements.board.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function getBallMetrics(cell) {
  const cellWidth = cell.clientWidth;
  const cellHeight = cell.clientHeight;
  const size = Math.min(cellWidth, cellHeight) * 0.28;
  const x = cell.offsetLeft + cellWidth * 0.12;
  const y = cell.offsetTop + cellHeight * 0.72 - size / 2;

  return {
    size,
    x,
    y,
    anchorX: x + size / 2,
    anchorY: y + size / 2,
  };
}

function getCellCenter(row, col) {
  const cell = getCell(row, col);
  if (!cell) {
    return null;
  }

  return {
    x: cell.offsetLeft + cell.clientWidth / 2,
    y: cell.offsetTop + cell.clientHeight / 2,
  };
}

function renderPath() {
  const width = elements.board.clientWidth;
  const height = elements.board.clientHeight;
  elements.pathOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const points = state.path
    .map(({ row, col }) => getCellCenter(row, col))
    .filter(Boolean);

  if (points.length < 2) {
    elements.pathLineShadow.setAttribute("points", "");
    elements.pathLine.setAttribute("points", "");
    return;
  }

  const pointString = points.map(({ x, y }) => `${x},${y}`).join(" ");
  elements.pathLineShadow.setAttribute("points", pointString);
  elements.pathLine.setAttribute("points", pointString);
}

function placeBall(animate) {
  const targetCell = getCell(state.ball.row, state.ball.col);
  if (!targetCell) {
    return;
  }

  const metrics = getBallMetrics(targetCell);
  elements.ball.classList.toggle("ball--instant", !animate);
  elements.ball.style.width = `${metrics.size}px`;
  elements.ball.style.height = `${metrics.size}px`;
  elements.ball.style.transform = `translate(${metrics.x}px, ${metrics.y}px)`;

  if (!animate) {
    requestAnimationFrame(() => {
      elements.ball.classList.remove("ball--instant");
    });
  }
}

function createBoardCells() {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < CONFIG.rows; row += 1) {
    for (let col = 0; col < CONFIG.cols; col += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      if (row === CONFIG.goalCell.row && col === CONFIG.goalCell.col) {
        cell.classList.add("board-cell--goal");
        cell.insertAdjacentHTML("beforeend", createGoalMarkup());
      }

      if (row === CONFIG.startPlayer.row && col === CONFIG.startPlayer.col) {
        cell.classList.add("board-cell--start");
        const player = document.createElement("div");
        player.className = "player player--red";
        player.style.setProperty("--tilt", `${CONFIG.startPlayer.tilt}deg`);
        player.innerHTML = createPlayerMarkup("red");
        cell.appendChild(player);
      }

      fragment.appendChild(cell);
    }
  }

  elements.board.prepend(fragment);
}

function renderControls() {
  const slots = [];

  for (let slot = 1; slot <= 9; slot += 1) {
    const direction = DIRECTION_DEFS.find((item) => item.slot === slot);

    if (!direction) {
      slots.push('<div class="control-gap" aria-hidden="true"></div>');
      continue;
    }

    slots.push(`
      <button
        class="direction-button"
        type="button"
        data-direction="${direction.id}"
        aria-label="${direction.label}"
        title="${direction.label}"
      >
        ${createArrowSvg(direction.rotation)}
      </button>
    `);
  }

  elements.controlsGrid.innerHTML = slots.join("");
}

function renderMoveLog() {
  if (state.moves.length === 0) {
    elements.moveLog.innerHTML = `<p class="move-log__empty">${CONFIG.emptyMessage}</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  state.moves.forEach((move, index) => {
    const chip = document.createElement("div");
    chip.className = "move-chip";
    chip.innerHTML = createArrowSvg(move.rotation);
    chip.setAttribute("aria-label", `第 ${index + 1} 步：${move.label}`);
    fragment.appendChild(chip);
  });

  elements.moveLog.replaceChildren(fragment);
  const logShell = elements.moveLog.parentElement;
  if (logShell) {
    logShell.scrollTop = logShell.scrollHeight;
  }
}

function flashBlocked(button) {
  if (!button) {
    return;
  }

  button.classList.remove("is-blocked");
  void button.offsetWidth;
  button.classList.add("is-blocked");
}

function syncControlState() {
  elements.controlsGrid.querySelectorAll(".direction-button").forEach((button) => {
    button.disabled = state.completed;
  });
}

function resetState(message = CONFIG.resetMessage) {
  state.ball = { ...CONFIG.startBall };
  state.path = [{ ...CONFIG.startBall }];
  state.moves = [];
  state.steps = 0;
  state.completed = false;

  updateStats();
  renderMoveLog();
  renderPath();
  placeBall(false);
  syncControlState();
  setStatus(message);
}

function isInsideBoard(row, col) {
  return row >= 0 && row < CONFIG.rows && col >= 0 && col < CONFIG.cols;
}

function handleMove(directionId, sourceButton) {
  if (state.completed) {
    setStatus(CONFIG.goalMessage);
    return;
  }

  const direction = DIRECTION_DEFS.find((item) => item.id === directionId);
  if (!direction) {
    return;
  }

  const nextRow = state.ball.row + direction.deltaRow;
  const nextCol = state.ball.col + direction.deltaCol;

  if (!isInsideBoard(nextRow, nextCol)) {
    setStatus(`${direction.label} 超出棋盘边界。`);
    flashBlocked(sourceButton);
    return;
  }

  if (obstacleKeys.has(`${nextRow}-${nextCol}`)) {
    setStatus(`${direction.label} 被障碍挡住了。`);
    flashBlocked(sourceButton);
    return;
  }

  state.ball = { row: nextRow, col: nextCol };
  state.path = [...state.path, { ...state.ball }];
  state.moves = [...state.moves, direction];
  state.steps += 1;

  updateStats();
  renderMoveLog();
  renderPath();
  placeBall(true);

  if (state.ball.row === CONFIG.goalCell.row && state.ball.col === CONFIG.goalCell.col) {
    state.completed = true;
    syncControlState();
    setStatus(CONFIG.goalMessage);
    return;
  }

  setStatus(`已执行${direction.label}，当前步数 ${state.steps}。`);
}

function bindEvents() {
  elements.controlsGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".direction-button");
    if (!button) {
      return;
    }

    handleMove(button.dataset.direction, button);
  });

  elements.resetButton.addEventListener("click", () => {
    resetState();
  });

  window.addEventListener("resize", () => {
    placeBall(false);
    renderPath();
  });
}

function init() {
  createBoardCells();
  renderControls();
  bindEvents();
  resetState(CONFIG.readyMessage);
}

init();
