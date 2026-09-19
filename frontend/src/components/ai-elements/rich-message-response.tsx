import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

function urlTransform(url: string) {
  const trimmed = url.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) return ''
  return trimmed
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
}

export function RichMessageResponse({ content }: { content: string }) {
  return (
    <div className="prose-jude">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={urlTransform}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
