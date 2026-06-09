import { useCallback, useEffect, useRef } from 'react'
import type React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { updatePage, type Page } from '../../api'
import { useUIStore } from '../../store'

interface MarkdownEditorProps {
  pageId: string
  initialContent: string
  initialScrollFraction?: number
  scrollFractionRef?: React.MutableRefObject<number>
  onPageUpdate: (page: Page) => void
}

const DEBOUNCE_MS = 800 // Must remain 800ms — project constraint

export default function MarkdownEditor({
  pageId,
  initialContent,
  initialScrollFraction = 0,
  scrollFractionRef,
  onPageUpdate,
}: MarkdownEditorProps) {
  const setSaveStatus = useUIStore((s) => s.setSaveStatus)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestContent = useRef(initialContent)
  // Sequence number to discard out-of-order save responses
  const saveSeq = useRef(0)

  // Cancel any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
    }
  }, [])

  const save = useCallback(
    async (content: string) => {
      const seq = ++saveSeq.current
      setSaveStatus('saving')
      try {
        const updated = await updatePage(pageId, { content })
        if (seq !== saveSeq.current) return
        onPageUpdate(updated)
        setSaveStatus('saved')
        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        if (seq !== saveSeq.current) return
        setSaveStatus('error')
      }
    },
    [pageId, setSaveStatus, onPageUpdate],
  )

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
  ]

  return (
    // flex-1 + min-h-0 to participate correctly in the flex column chain.
    // The inner style height:100% is required for CodeMirror's scroll to work.
    <div className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
      <CodeMirror
        value={initialContent}
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
