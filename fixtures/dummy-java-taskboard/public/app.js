/**
 * Browser mirror of com.example.taskboard.TaskBoardService
 */
const state = {
  tasks: [],
  filter: 'ALL',
  nextId: 1,
}

const els = {
  title: document.getElementById('task-title'),
  priority: document.getElementById('task-priority'),
  add: document.getElementById('add-task'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  status: document.getElementById('status'),
  formError: document.getElementById('form-error'),
  filters: Array.from(document.querySelectorAll('[data-filter]')),
}

function addTask() {
  const title = els.title.value.trim()
  if (!title) {
    els.formError.hidden = false
    return
  }
  els.formError.hidden = true
  state.tasks.push({
    id: String(state.nextId++),
    title,
    priority: els.priority.value,
    completed: false,
  })
  els.title.value = ''
  render()
}

function completeTask(id) {
  const task = state.tasks.find((t) => t.id === id)
  if (task) task.completed = !task.completed
  render()
}

function visibleTasks() {
  return state.tasks.filter((t) => {
    if (state.filter === 'ACTIVE') return !t.completed
    if (state.filter === 'COMPLETED') return t.completed
    return true
  })
}

function setFilter(filter) {
  state.filter = filter
  els.filters.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.filter === filter)
  })
  render()
}

function render() {
  const items = visibleTasks()
  els.list.innerHTML = ''
  for (const task of items) {
    const li = document.createElement('li')
    li.className = `task${task.completed ? ' completed' : ''}`
    li.dataset.testid = `task-${task.id}`
    li.dataset.priority = task.priority
    li.innerHTML = `
      <input class="toggle" type="checkbox" data-testid="toggle-${task.id}" ${
        task.completed ? 'checked' : ''
      } aria-label="Complete ${task.title}" />
      <div>
        <div class="title" data-testid="task-title-${task.id}">${escapeHtml(task.title)}</div>
        <div class="meta">id ${task.id}</div>
      </div>
      <span class="badge ${task.priority}" data-testid="priority-${task.id}">${task.priority}</span>
    `
    li.querySelector('.toggle').addEventListener('change', () => completeTask(task.id))
    els.list.appendChild(li)
  }

  els.empty.hidden = items.length > 0
  if (items.length === 0) {
    els.empty.textContent =
      state.tasks.length === 0
        ? 'No tasks yet. Add one above.'
        : state.filter === 'ACTIVE'
          ? 'No active tasks.'
          : state.filter === 'COMPLETED'
            ? 'No completed tasks.'
            : 'No tasks match this filter.'
  }

  const active = state.tasks.filter((t) => !t.completed).length
  const done = state.tasks.filter((t) => t.completed).length
  els.status.textContent = `${state.tasks.length} tasks · ${active} active · ${done} completed`
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

els.add.addEventListener('click', addTask)
els.title.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask()
})
els.filters.forEach((btn) => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter))
})

render()
