import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  getTodos,
  updateTodo,
  type Todo,
} from '../../api'
import { Skeleton } from '../../components/ui/Skeleton'
import { useDocumentTitle } from '../../lib/title'
import { confirmDialog } from '../../components/ui/ConfirmDialog'

export const Route = createFileRoute('/_auth/todo')({
  component: TodoList,
})

/**
 * Same order the server returns: open tasks pinned first, then by list
 * position; done tasks most-recent first (their pin only matters once un-ticked).
 */
function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0)
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}

function TodoList() {
  useDocumentTitle('To-do')
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showCompleted, setShowCompleted] = useState(true)
  const newTaskRef = useRef<HTMLInputElement>(null)

  const reload = async () => {
    try {
      setTodos(await getTodos())
      setError(null)
    } catch {
      setError('Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  /**
   * Apply a change locally first so ticking a box feels instant; if the server
   * rejects it, resync from the server rather than guessing how to roll back.
   */
  const optimistic = async (apply: (prev: Todo[]) => Todo[], request: () => Promise<unknown>) => {
    setTodos((prev) => sortTodos(apply(prev)))
    try {
      await request()
    } catch {
      setError('Change failed — list reloaded.')
      await reload()
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const created = await createTodo(title)
      setTodos((prev) => sortTodos([...prev, created]))
      setNewTitle('')
      setError(null)
    } catch {
      setError('Could not add the task.')
    } finally {
      setAdding(false)
      // Stay in the box for the next task. Clicking "Add" moves focus to the
      // button, which is then disabled (empty box) and would drop focus.
      newTaskRef.current?.focus()
    }
  }

  const toggle = (todo: Todo) =>
    optimistic(
      (prev) =>
        prev.map((t) =>
          t.id === todo.id
            ? { ...t, done: !t.done, completedAt: t.done ? null : Math.floor(Date.now() / 1000) }
            : t,
        ),
      () => updateTodo(todo.id, { done: !todo.done }),
    )

  const togglePin = (todo: Todo) =>
    optimistic(
      (prev) => prev.map((t) => (t.id === todo.id ? { ...t, pinned: !t.pinned } : t)),
      () => updateTodo(todo.id, { pinned: !todo.pinned }),
    )

  const rename = (todo: Todo, title: string) =>
    optimistic(
      (prev) => prev.map((t) => (t.id === todo.id ? { ...t, title } : t)),
      () => updateTodo(todo.id, { title }),
    )

  const remove = async (todo: Todo) => {
    const ok = await confirmDialog({ title: `Delete "${todo.title}"?`, confirmLabel: 'Delete task' })
    if (!ok) return
    await optimistic(
      (prev) => prev.filter((t) => t.id !== todo.id),
      () => deleteTodo(todo.id),
    )
  }

  const clearCompleted = async () => {
    const count = todos.filter((t) => t.done).length
    const ok = await confirmDialog({
      title: `Clear ${count} completed ${count === 1 ? 'task' : 'tasks'}?`,
      message: 'They are deleted for good.',
      confirmLabel: 'Clear',
    })
    if (!ok) return
    await optimistic((prev) => prev.filter((t) => !t.done), clearCompletedTodos)
  }

  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-baseline gap-3 mb-6">
          <h1 className="text-2xl font-bold text-gray-100">To-do</h1>
          {!loading && (
            <span className="text-sm text-gray-500">
              {open.length === 0 ? 'All done' : `${open.length} open`}
            </span>
          )}
        </div>

        <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2 mb-6">
          <input
            ref={newTaskRef}
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a task…"
            maxLength={500}
            className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || adding}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-gray-50 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : (
          <>
            {open.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                {done.length === 0 ? 'No tasks yet. Add one above.' : 'Nothing left to do.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {open.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} onToggle={toggle} onTogglePin={togglePin} onRename={rename} onDelete={remove} />
                ))}
              </ul>
            )}

            {done.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    aria-expanded={showCompleted}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-200 transition-colors"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Completed · {done.length}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => void clearCompleted()}
                    className="text-xs text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-900/20 transition-colors"
                  >
                    Clear completed
                  </button>
                </div>
                {showCompleted && (
                  <ul className="space-y-1">
                    {done.map((todo) => (
                      <TodoItem key={todo.id} todo={todo} onToggle={toggle} onTogglePin={togglePin} onRename={rename} onDelete={remove} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface TodoItemProps {
  todo: Todo
  onToggle: (todo: Todo) => void
  onTogglePin: (todo: Todo) => void
  onRename: (todo: Todo, title: string) => void
  onDelete: (todo: Todo) => void
}

/** Pushpin (Tabler "pin" outline); filled when the task is pinned. */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M15 4.5l-4 4-4 1.5-1.5 1.5 7 7 1.5-1.5 1.5-4 4-4" fill={filled ? 'currentColor' : 'none'} />
      <path d="M9 15l-4.5 4.5M14.5 4l5.5 5.5" />
    </svg>
  )
}

function TodoItem({ todo, onToggle, onTogglePin, onRename, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(todo.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    setValue(todo.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    // An emptied title reverts rather than deleting — deleting has its own button.
    if (trimmed && trimmed !== todo.title) onRename(todo, trimmed)
  }

  // A done task keeps its pin (it returns to the top if un-ticked) but doesn't
  // show it — pinning only orders the open list.
  const showPinned = todo.pinned && !todo.done

  return (
    <li
      className={`group flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ${
        showPinned
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
      }`}
    >
      <button
        onClick={() => onToggle(todo)}
        role="checkbox"
        aria-checked={todo.done}
        aria-label={todo.done ? `Mark "${todo.title}" as not done` : `Mark "${todo.title}" as done`}
        className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          todo.done ? 'bg-blue-600 border-blue-600' : 'border-gray-500 hover:border-blue-400'
        }`}
      >
        {todo.done && (
          <svg className="w-2.5 h-2.5 text-gray-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={value}
          maxLength={500}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 min-w-0 px-1 -mx-1 text-sm bg-gray-800 border border-gray-600 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      ) : (
        <span
          onDoubleClick={startEditing}
          title="Double-click to edit"
          className={`flex-1 min-w-0 text-sm break-words ${
            todo.done ? 'text-gray-500 line-through' : 'text-gray-200'
          }`}
        >
          {todo.title}
        </span>
      )}

      {/* Always visible while pinned, so important tasks read as such at a glance */}
      {!editing && !todo.done && (
        <button
          onClick={() => onTogglePin(todo)}
          aria-pressed={todo.pinned}
          aria-label={todo.pinned ? `Unpin "${todo.title}"` : `Pin "${todo.title}" to the top`}
          title={todo.pinned ? 'Unpin' : 'Pin to top'}
          className={`p-1 rounded flex-shrink-0 transition-opacity focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            todo.pinned
              ? 'text-amber-400 hover:text-amber-300 hover:bg-gray-800'
              : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800 opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <PinIcon filled={todo.pinned} />
        </button>
      )}

      {!editing && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            onClick={startEditing}
            aria-label="Edit task"
            title="Edit"
            className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.5H9V13z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(todo)}
            aria-label="Delete task"
            title="Delete"
            className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </li>
  )
}
