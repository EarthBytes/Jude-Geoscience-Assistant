import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageResponse } from './message'

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
