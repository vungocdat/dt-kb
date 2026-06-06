import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * Shared processor instance. unified processors are reusable and stateless
 * across .process() calls, so we build the pipeline once at module load
 * rather than per-request.
 *
 * SECURITY NOTE: remark-rehype is configured WITHOUT allowDangerousHtml, so any
 * raw HTML embedded in user markdown is dropped rather than passed through. This
 * is the sanitization boundary — rendered HTML cached in content_html is safe to
 * inject client-side via dangerouslySetInnerHTML.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkEmoji, { emoticon: true }) // :smile: and :) → emoji
  .use(remarkRehype) // no allowDangerousHtml -> raw HTML stripped
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify);

/**
 * Render markdown to sanitized, syntax-highlighted HTML.
 * Called at save time (POST/PATCH page) and cached in content_html.
 */
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) return '';
  const file = await processor.process(content);
  return String(file);
}
