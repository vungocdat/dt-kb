interface MarkdownRendererProps {
  html: string
}

export function MarkdownRenderer({ html }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-invert max-w-none px-8 py-6"
      // Content is server-rendered HTML — safe to inject directly.
      // Never parse markdown client-side.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
