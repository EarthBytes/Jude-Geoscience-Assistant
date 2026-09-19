import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Message, MessageResponse } from './message'
import { RichMessageResponse } from './rich-message-response'

describe('MessageResponse', () => {
  it('renders streamed content while the rich renderer loads', () => {
    render(<MessageResponse content="A **grounded** answer" />)

    expect(screen.getByText(/A/)).toBeInTheDocument()
  })

  it('shows a typing indicator for an empty streamed reply', () => {
    const { container } = render(<MessageResponse content="" />)

    expect(container.querySelector('.animate-pulse-soft')).toBeInTheDocument()
  })
})

describe('Message', () => {
  it('plays the enter animation once even when the reply keeps streaming', async () => {
    const { container, rerender } = render(
      <Message from="assistant">
        <span>…</span>
      </Message>,
    )
    const root = container.firstElementChild

    expect(root).toHaveClass('message-enter')

    await waitFor(() => {
      expect(root).toHaveClass('animate-message-in')
    })

    rerender(
      <Message from="assistant">
        <span>Basalt is a fine-grained igneous rock.</span>
      </Message>,
    )

    expect(root).toHaveClass('animate-message-in')
    expect(root).not.toHaveClass('message-enter')
  })
})

describe('RichMessageResponse', () => {
  it('renders bullet lists, numbered lists, and tables', () => {
    const { container } = render(
      <RichMessageResponse
        content={`- granite
- basalt

1. weathering
2. erosion

| Rock | Type |
| --- | --- |
| Granite | Igneous |`}
      />,
    )

    expect(container.querySelector('ul')).toBeInTheDocument()
    expect(container.querySelector('ol')).toBeInTheDocument()
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(screen.getByText('granite')).toBeInTheDocument()
    expect(screen.getByText('weathering')).toBeInTheDocument()
    expect(screen.getByText('Igneous')).toBeInTheDocument()
  })
})
