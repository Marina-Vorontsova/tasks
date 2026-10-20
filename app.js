const STORAGE_KEY = "one-task-a-day:v1";

const DEFAULT_STATE = {
  tasks: [],
  currentTaskId: null,
  currentActiveDate: null,
  successImageDate: null,
  hasCompletedOnboarding: false,
};

let state = loadState();
let view = state.hasCompletedOnboarding ? "today" : "onboarding";
let archiveExpanded = false;
let modal = null;
let pendingDelete = null;
let pendingDeleteTimer = null;
let celebration = null;
let celebrationTimer = null;

const app = document.querySelector("#app");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return { ...DEFAULT_STATE };

    return {
      ...DEFAULT_STATE,
      ...saved,
      tasks: Array.isArray(saved.tasks) ? saved.tasks.map(normalizeTask) : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function normalizeTask(task) {
  return {
    description: "",
    archivedAt: null,
    availableAfterActiveDate: null,
    ...task,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeTasks() {
  return state.tasks.filter((task) => task.status === "active");
}

function archivedTasks() {
  return state.tasks
    .filter((task) => task.status === "completed" || task.status === "cancelled")
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
}

function taskById(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function isTaskActive(id) {
  return Boolean(taskById(id)?.status === "active");
}

function eligibleActiveTasks() {
  const currentDay = state.currentActiveDate;
  return activeTasks().filter((task) => task.availableAfterActiveDate !== currentDay);
}

function pickRandomTask(tasks) {
  if (!tasks.length) return null;
  const index = Math.floor(Math.random() * tasks.length);
  return tasks[index];
}

function ensureTodaySelection() {
  const active = activeTasks();

  if (!state.hasCompletedOnboarding && active.length === 0 && !state.currentActiveDate) {
    return;
  }

  const today = todayKey();

  if (state.currentActiveDate !== today) {
    state.currentActiveDate = today;
    state.successImageDate = null;

    if (!isTaskActive(state.currentTaskId)) {
      const nextTask = pickRandomTask(eligibleActiveTasks());
      state.currentTaskId = nextTask ? nextTask.id : null;
    }

    saveState();
    return;
  }

  if (state.currentTaskId && !isTaskActive(state.currentTaskId)) {
    state.currentTaskId = null;
    saveState();
  }
}

function replaceCurrentTaskNow() {
  if (!state.currentActiveDate) state.currentActiveDate = todayKey();
  state.successImageDate = null;
  const nextTask = pickRandomTask(eligibleActiveTasks());
  state.currentTaskId = nextTask ? nextTask.id : null;
}

function taskIsBlockedForToday() {
  return state.currentActiveDate === todayKey();
}

function addTask(text) {
  const trimmedText = text.trim();
  if (!trimmedText) return false;

  state.tasks.push({
    id: createId(),
    text: trimmedText,
    description: "",
    status: "active",
    createdAt: Date.now(),
    archivedAt: null,
    availableAfterActiveDate: taskIsBlockedForToday() ? state.currentActiveDate : null,
  });

  state.hasCompletedOnboarding = true;
  saveState();
  return true;
}

function completeTask(id, { showEffect = false } = {}) {
  const task = taskById(id);
  if (!task || task.status !== "active") return;

  task.status = "completed";
  task.archivedAt = Date.now();
  task.availableAfterActiveDate = null;

  if (state.currentTaskId === id) {
    if (!state.currentActiveDate) state.currentActiveDate = todayKey();
    state.currentTaskId = null;
    state.successImageDate = state.currentActiveDate;
    if (showEffect) showCelebration();
  }

  saveState();
  render();
}

function cancelTask(id) {
  const task = taskById(id);
  if (!task) return;

  const wasCurrent = state.currentTaskId === id;
  task.status = "cancelled";
  task.archivedAt = Date.now();
  task.availableAfterActiveDate = null;

  if (wasCurrent) replaceCurrentTaskNow();

  saveState();
  closeModal({ skipRender: true });
  render();
}

function deleteTask(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index === -1) return;

  const task = state.tasks[index];
  const wasCurrent = state.currentTaskId === id;
  const previousCurrentTaskId = state.currentTaskId;

  state.tasks.splice(index, 1);

  if (wasCurrent) replaceCurrentTaskNow();

  saveState();
  closeModal({ skipRender: true });
  createPendingDelete({ task, index, wasCurrent, previousCurrentTaskId });
  render();
}

function createPendingDelete(context) {
  if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
  pendingDelete = context;
  pendingDeleteTimer = window.setTimeout(() => {
    pendingDelete = null;
    pendingDeleteTimer = null;
    render();
  }, 3000);
}

function undoDelete() {
  if (!pendingDelete) return;

  const { task, index, wasCurrent, previousCurrentTaskId } = pendingDelete;
  const safeIndex = Math.max(0, Math.min(index, state.tasks.length));
  state.tasks.splice(safeIndex, 0, task);

  if (wasCurrent) {
    state.currentTaskId = previousCurrentTaskId;
  }

  pendingDelete = null;
  if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer);
  pendingDeleteTimer = null;
  saveState();
  render();
}

function restoreTask(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index === -1) return;

  const [task] = state.tasks.splice(index, 1);
  task.status = "active";
  task.archivedAt = null;
  task.availableAfterActiveDate = taskIsBlockedForToday() ? state.currentActiveDate : null;
  state.tasks.push(task);

  saveState();
  render();
}

function updateTaskDetails(id, title) {
  const task = taskById(id);
  const trimmedTitle = title.trim();
  if (!task || !trimmedTitle) return false;

  task.text = trimmedTitle;
  saveState();
  return true;
}

function showCelebration() {
  const effects = ["✨", "🌿", "☀️", "🎉", "🌸"];
  celebration = effects[Math.floor(Math.random() * effects.length)];
  if (celebrationTimer) clearTimeout(celebrationTimer);
  celebrationTimer = window.setTimeout(() => {
    celebration = null;
    render();
  }, 1400);
}

function setView(nextView) {
  if (nextView !== view) archiveExpanded = false;
  view = nextView;
  modal = null;
  render();
}

function openAddModal() {
  modal = { type: "add" };
  render();
  requestAnimationFrame(() => {
    document.querySelector("#new-task-text")?.focus();
  });
}

function openTaskModal(id) {
  const task = taskById(id);
  modal = {
    type: "task",
    taskId: id,
    draftTitle: task?.text || "",
  };
  render();
  requestAnimationFrame(() => {
    const field = document.querySelector("#task-title");
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  });
}

function saveModalDraft() {
  if (!modal || modal.type !== "task") return true;

  const titleField = document.querySelector("#task-title");
  const title = titleField ? titleField.value : modal.draftTitle;
  const saved = updateTaskDetails(modal.taskId, title);

  if (saved) {
    modal.draftTitle = title.trim();
  }

  return saved;
}

function closeModal({ skipRender = false } = {}) {
  saveModalDraft();
  modal = null;
  if (!skipRender) render();
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.type) node.type = options.type;
  if (options.id) node.id = options.id;
  if (options.value !== undefined) node.value = options.value;
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.src) node.src = options.src;
  if (options.alt !== undefined) node.alt = options.alt;
  if (options.ariaLabel) node.setAttribute("aria-label", options.ariaLabel);
  if (options.role) node.setAttribute("role", options.role);
  if (options.rows) node.rows = options.rows;
  if (options.disabled) node.disabled = true;
  if (options.onClick) node.addEventListener("click", options.onClick);
  if (options.onSubmit) node.addEventListener("submit", options.onSubmit);
  if (options.onInput) node.addEventListener("input", options.onInput);
  if (options.onError) node.addEventListener("error", options.onError);

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }

  return node;
}

function squareButton({ label, className = "", text = "", onClick }) {
  return el(
    "button",
    {
      className: `square-check ${className}`.trim(),
      ariaLabel: label,
      onClick,
    },
    [document.createTextNode(text)],
  );
}

function render() {
  app.replaceChildren();

  if (!state.hasCompletedOnboarding && view === "onboarding") {
    app.append(renderOnboarding());
    if (modal) app.append(renderModal());
    return;
  }

  if (view === "today") ensureTodaySelection();

  app.append(renderMainScreen());
  if (modal) app.append(renderModal());
  if (pendingDelete) app.append(renderSnackbar());
}

function renderOnboarding() {
  return el("main", { className: "screen without-nav" }, [
    el("section", { className: "hero" }, [
      el("p", { className: "eyebrow", text: "Одна задача" }),
      el("h1", { text: "Спокойно разберите накопившееся" }),
      el("p", {
        className: "lead",
        text: "Добавьте дела, которые хотите держать в поле внимания. Приложение будет показывать только одну задачу на активный день.",
      }),
      el("div", { className: "actions" }, [
        el("button", {
          className: "button primary",
          text: "Добавить задачи",
          onClick: () => {
            view = "tasks";
            openAddModal();
          },
        }),
        el("button", {
          className: "button",
          text: "Как это работает?",
          onClick: () => setView("settings"),
        }),
      ]),
    ]),
  ]);
}

function renderMainScreen() {
  const fragment = document.createDocumentFragment();
  const main = el("main", { className: "screen" });

  if (view === "today") main.append(renderToday());
  if (view === "tasks") main.append(renderTasks());
  if (view === "settings") main.append(renderSettings());

  fragment.append(main, renderNav());
  return fragment;
}

function renderToday() {
  const currentTask = isTaskActive(state.currentTaskId) ? taskById(state.currentTaskId) : null;
  const section = el("section");

  section.append(el("h2", { className: "page-title", text: "Сегодня" }));

  if (currentTask) {
    const card = el("div", { className: "today-card" }, [
      squareButton({
        label: "Выполнить задачу",
        onClick: () => completeTask(currentTask.id, { showEffect: true }),
      }),
      el("p", { className: "today-text", text: currentTask.text }),
    ]);

    if (celebration) {
      card.append(el("div", { className: "celebration", text: celebration, ariaLabel: "Готово" }));
    }

    section.append(card);
    return section;
  }

  const hasActive = activeTasks().length > 0;
  const showSuccessImage = state.successImageDate === state.currentActiveDate;
  section.append(
    el("div", { className: "empty-card" }, [
      showSuccessImage
        ? el("img", {
            className: "success-illustration",
            src: "cat-success.png",
            alt: "Довольный котик",
          })
        : null,
      el("h3", { text: hasActive ? "На сегодня задач нет" : "Активных задач нет" }),
      el("p", {
        className: "muted",
        text: hasActive
          ? "Следующая задача будет завтра"
          : "Добавьте задачи на экране «Задачи», чтобы начать.",
      }),
    ]),
  );

  return section;
}

function renderTasks() {
  const section = el("section");
  const active = activeTasks();
  const archive = archivedTasks();

  section.append(
    el("div", { className: "title-row" }, [
      el("h2", { className: "page-title", text: "Задачи" }),
      el("button", {
        className: "button primary top-add-button",
        text: "+ Новая задача",
        onClick: openAddModal,
      }),
    ]),
  );

  const activeSection = el("div", { className: "task-section" });

  if (active.length) {
    activeSection.append(el("div", { className: "task-list" }, active.map(renderActiveTaskRow)));
  } else {
    activeSection.append(
      el("div", { className: "empty-card" }, [
        el("p", { className: "muted", text: "Пока нет активных задач." }),
      ]),
    );
  }

  section.append(activeSection);

  if (archive.length) {
    const archiveHead = el("div", { className: "section-head" }, [
      el("h3", { text: "Архив" }),
      el("button", {
        className: "archive-toggle",
        text: archiveExpanded ? "↑" : "↓",
        ariaLabel: archiveExpanded ? "Свернуть архив" : "Показать архив",
        onClick: () => {
          archiveExpanded = !archiveExpanded;
          render();
        },
      }),
    ]);
    const archiveSection = el("div", { className: "task-section" }, [archiveHead]);

    if (archiveExpanded) {
      archiveSection.append(el("div", { className: "task-list" }, archive.map(renderArchivedTaskRow)));
    }

    section.append(archiveSection);
  }

  return section;
}

function renderActiveTaskRow(task) {
  return el("div", { className: "task-row" }, [
    squareButton({
      label: "Выполнить задачу",
      onClick: () => completeTask(task.id, { showEffect: task.id === state.currentTaskId }),
    }),
    el("button", {
      className: "task-text-button",
      text: task.text,
      onClick: () => openTaskModal(task.id),
    }),
  ]);
}

function renderArchivedTaskRow(task) {
  const isCompleted = task.status === "completed";
  return el("div", { className: "task-row archived" }, [
    squareButton({
      label: "Восстановить задачу",
      className: isCompleted ? "completed" : "cancelled",
      text: isCompleted ? "✓" : "×",
      onClick: () => restoreTask(task.id),
    }),
    el("button", {
      className: "task-text-button",
      text: task.text,
      onClick: () => openTaskModal(task.id),
    }),
    el("button", {
      className: "icon-button",
      text: "×",
      ariaLabel: "Удалить задачу",
      onClick: () => deleteTask(task.id),
    }),
  ]);
}

function renderSettings() {
  const section = el("section");
  section.append(el("p", { className: "eyebrow", text: "О программе" }));
  section.append(el("h2", { text: "Как это работает" }));
  section.append(
    el("div", { className: "panel" }, [
      el("p", {
        text: "Добавьте свои незавершённые задачи. Приложение случайно выберет одну активную задачу и покажет её на экране «Сегодня».",
      }),
      el("ul", {}, [
        el("li", { text: "Работайте только с текущей задачей." }),
        el("li", { text: "Выполненные задачи перемещаются в архив." }),
        el("li", {
          text: "Незавершённая задача остаётся текущей, пока вы не выполните, не отмените или не удалите её.",
        }),
        el("li", {
          text: "Новая задача появляется в следующий активный день — когда вы снова откроете приложение в новый календарный день.",
        }),
      ]),
      !state.hasCompletedOnboarding
        ? el("div", { className: "actions" }, [
            el("button", {
              className: "button primary",
              text: "Добавить задачи",
              onClick: () => {
                view = "tasks";
                openAddModal();
              },
            }),
            el("button", {
              className: "button",
              text: "Назад",
              onClick: () => setView("onboarding"),
            }),
          ])
        : null,
    ]),
  );
  return section;
}

function renderNav() {
  const items = [
    ["today", "Сегодня"],
    ["tasks", "Задачи"],
    ["settings", "О программе"],
  ];

  return el(
    "nav",
    { className: "bottom-nav", ariaLabel: "Основная навигация" },
    items.map(([key, label]) =>
      el("button", {
        className: `nav-button ${view === key ? "active" : ""}`.trim(),
        text: label,
        onClick: () => setView(key),
      }),
    ),
  );
}

function renderModal() {
  if (modal.type === "add") return renderAddModal();
  if (modal.type === "task") return renderTaskModal();
  return document.createDocumentFragment();
}

function renderAddModal() {
  const form = el("form", {
    className: "modal",
    role: "dialog",
    onSubmit: (event) => {
      event.preventDefault();
      const field = event.currentTarget.querySelector("#new-task-text");
      if (addTask(field.value)) {
        modal = null;
        view = "tasks";
        render();
      }
    },
  });

  form.append(
    el("h3", { className: "modal-title", text: "Новая задача" }),
    el("textarea", {
      id: "new-task-text",
      className: "field",
      rows: 5,
      placeholder: "Например: разобрать коробку с документами",
    }),
    el("div", { className: "modal-actions" }, [
      el("button", { className: "button primary", type: "submit", text: "Сохранить" }),
      el("button", {
        className: "button ghost",
        type: "button",
        text: "Закрыть",
        onClick: () => closeModal(),
      }),
    ]),
  );

  return modalBackdrop(form);
}

function renderTaskModal() {
  const task = taskById(modal.taskId);
  if (!task) {
    modal = null;
    return document.createDocumentFragment();
  }

  const isActive = task.status === "active";
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const content = el("div", { className: "modal", role: "dialog" });
  const checkboxClass = isCompleted ? "completed" : isCancelled ? "cancelled" : "";
  const checkboxText = isCompleted ? "✓" : isCancelled ? "×" : "";
  const checkboxLabel = isActive ? "Выполнить задачу" : "Восстановить задачу";

  content.append(
    el("div", { className: "modal-task-title-row" }, [
      squareButton({
        label: checkboxLabel,
        className: checkboxClass,
        text: checkboxText,
        onClick: () => {
          if (saveModalDraft()) {
            modal = null;
            if (isActive) {
              completeTask(task.id, { showEffect: task.id === state.currentTaskId });
            } else {
              restoreTask(task.id);
            }
          }
        },
      }),
      el("input", {
        id: "task-title",
        className: "title-field",
        value: modal.draftTitle,
        placeholder: "Заголовок задачи",
        onInput: (event) => {
          modal.draftTitle = event.currentTarget.value;
        },
      }),
    ]),
    el("div", { className: "modal-actions" }, [
      el("button", {
        className: "button primary",
        text: "Сохранить",
        onClick: () => {
          if (saveModalDraft()) closeModal();
        },
      }),
      el("button", {
        className: "button",
        text: "Не буду делать",
        onClick: () => {
          if (saveModalDraft()) cancelTask(task.id);
        },
      }),
      el("button", { className: "button danger", text: "Удалить", onClick: () => deleteTask(task.id) }),
    ]),
  );

  return modalBackdrop(content);
}

function modalBackdrop(content) {
  return el("div", {
    className: "modal-backdrop",
    onClick: (event) => {
      if (event.target === event.currentTarget) closeModal();
    },
  }, [content]);
}

function renderSnackbar() {
  return el("div", { className: "snackbar" }, [
    el("span", { text: "Задача удалена" }),
    el("button", { text: "Отменить", onClick: undoDelete }),
  ]);
}

render();
