import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import CodeMirror, { Prec } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { useUIStore } from '../../store'

/**
 * One Dark keeps the syntax colours, but its bluish #282c34 surfaces clash with
 * the app's neutral grays. Make the editor transparent so it sits on whatever
 * surface hosts it (page body or calendar pane). Prec.highest so these rules
 * win over One Dark's own theme.
 */
const kbEditorTheme = Prec.highest(
  EditorView.theme(
    {
      '&': { color: 'var(--kb-gray-100)', backgroundColor: 'transparent' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--kb-gray-500)',
        borderRight: '1px solid var(--kb-gray-800)',
      },
      '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--kb-gray-300)' },
      '.cm-panels': { backgroundColor: 'var(--kb-gray-900)', color: 'var(--kb-gray-100)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--kb-gray-700)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--kb-gray-700)' },
    },
    { dark: true },
  ),
)

interface MarkdownEditorProps {
  initialContent: string
  initialScrollFraction?: number
  scrollFractionRef?: React.MutableRefObject<number>
  /**
   * Persists the debounced content. Save status, the debounce and the
   * out-of-order guard are handled here; what "save" means is the caller's
   * business — a page PATCH, a calendar-note PUT, anything else.
   */
  onSave: (content: string) => Promise<void>
}

const DEBOUNCE_MS = 800 // Must remain 800ms — project constraint

export default function MarkdownEditor({
  initialContent,
  initialScrollFraction = 0,
  scrollFractionRef,
  onSave,
}: MarkdownEditorProps) {
  const setSaveStatus = useUIStore((s) => s.setSaveStatus)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestContent = useRef(initialContent)
  // Sequence number to discard out-of-order save responses
  const saveSeq = useRef(0)

  // The document is frozen at mount: CodeMirror's `value` prop is controlled,
  // and pushing a just-saved (possibly stale vs. what the user typed since)
  // value back in would replace the doc and jump the cursor to the top.
  // Fresh content arrives via remount (keyed by page id / edit-mode entry).
  const [initialDoc] = useState(initialContent)

  // Flush any pending debounced save on unmount so the last <800ms of typing
  // isn't lost when switching back to read mode or navigating away.
  // (saveRef keeps the unmount-only effect from re-running as `save` changes.)
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
        void saveRef.current(latestContent.current)
      }
    }
  }, [])

  const save = useCallback(
    async (content: string) => {
      const seq = ++saveSeq.current
      setSaveStatus('saving')
      try {
        await onSave(content)
        if (seq !== saveSeq.current) return
        setSaveStatus('saved')
        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        if (seq !== saveSeq.current) return
        setSaveStatus('error')
      }
    },
    [setSaveStatus, onSave],
  )

  const saveRef = useRef(save)
  saveRef.current = save

  const handleChange = useCallback(
    (value: string) => {
      latestContent.current = value
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current)
      }
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null
        void save(latestContent.current)
      }, DEBOUNCE_MS)
    },
    [save],
  )

  const onCreateEditor = useCallback(
    (view: EditorView) => {
      // Restore scroll position from read mode
      if (initialScrollFraction >= 0.01) {
        const totalLines = view.state.doc.lines
        const targetLine = Math.max(
          1,
          Math.min(Math.round(initialScrollFraction * totalLines), totalLines),
        )
        const pos = view.state.doc.line(targetLine).from
        requestAnimationFrame(() => {
          view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
        })
      }

      view.focus()

      // Track scroll position so read mode can restore it when switching back
      if (scrollFractionRef) {
        view.scrollDOM.addEventListener('scroll', () => {
          const el = view.scrollDOM
          const max = el.scrollHeight - el.clientHeight
          scrollFractionRef.current = max > 0 ? el.scrollTop / max : 0
        })
      }
    },
    [initialScrollFraction, scrollFractionRef],
  )

  const extensions = [
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    kbEditorTheme,
  ]

  return (
    // flex-1 + min-h-0 to participate correctly in the flex column chain.
    // The inner style height:100% is required for CodeMirror's scroll to work.
    <div className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
      <CodeMirror
        value={initialDoc}
        height="100%"
        theme={oneDark}
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={onCreateEditor}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
        }}
        style={{ height: '100%', fontSize: '14px' }}
      />
    </div>
  )
}
