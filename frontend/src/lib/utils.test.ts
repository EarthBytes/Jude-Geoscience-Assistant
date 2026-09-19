import { describe, expect, it } from 'vitest'
import { slugifyFilename, threadToMarkdown } from './utils'

describe('threadToMarkdown', () => {
  it('exports a readable transcript', () => {
    const markdown = threadToMarkdown('Granite', [
      { role: 'user', content: 'What is granite?' },
      { role: 'assistant', content: 'An intrusive igneous rock.' },
    ])

    expect(markdown).toContain('# Granite')
    expect(markdown).toContain('**You**')
    expect(markdown).toContain('What is granite?')
    expect(markdown).toContain('**Jude**')
    expect(markdown).toContain('An intrusive igneous rock.')
  })
})

describe('slugifyFilename', () => {
  it('turns a title into a safe download name', () => {
    expect(slugifyFilename('What is granite?')).toBe('what-is-granite')
  })
})
