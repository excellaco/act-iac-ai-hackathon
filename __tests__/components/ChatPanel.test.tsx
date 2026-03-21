jest.mock('../../lib/apiClient', () => ({
  sendChatMessage: jest.fn(),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatPanel from '../../app/components/ChatPanel'
import { sendChatMessage } from '../../lib/apiClient'

describe('ChatPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders collapsed by default', () => {
    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)

    expect(screen.getByText('Ask about Fairfax County, VA')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Ask about this jurisdiction/)).not.toBeInTheDocument()
  })

  it('expands on header click to show input', () => {
    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)

    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    expect(screen.getByPlaceholderText(/Ask about this jurisdiction/)).toBeInTheDocument()
    expect(screen.getByLabelText('Send message')).toBeInTheDocument()
  })

  it('collapses when header is clicked again', () => {
    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)

    const header = screen.getByText('Ask about Fairfax County, VA')
    fireEvent.click(header) // expand
    expect(screen.getByPlaceholderText(/Ask about this jurisdiction/)).toBeInTheDocument()

    fireEvent.click(header) // collapse
    expect(screen.queryByPlaceholderText(/Ask about this jurisdiction/)).not.toBeInTheDocument()
  })

  it('sends message and displays response', async () => {
    ;(sendChatMessage as jest.Mock).mockResolvedValue({
      reply: 'Fairfax requires 2.0 spaces per unit.',
    })

    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const input = screen.getByPlaceholderText(/Ask about this jurisdiction/)
    fireEvent.change(input, { target: { value: 'Why is parking score high?' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    // User message appears immediately
    expect(screen.getByText('Why is parking score high?')).toBeInTheDocument()

    // Loading state
    expect(screen.getByLabelText('Loading response')).toBeInTheDocument()

    // Wait for assistant response
    await waitFor(() => {
      expect(screen.getByText('Fairfax requires 2.0 spaces per unit.')).toBeInTheDocument()
    })

    expect(sendChatMessage).toHaveBeenCalledWith('uuid-1', 'Why is parking score high?', [])
  })

  it('shows error message on API failure', async () => {
    ;(sendChatMessage as jest.Mock).mockRejectedValue(
      new Error('Unable to reach assistant. Try again.'),
    )

    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const input = screen.getByPlaceholderText(/Ask about this jurisdiction/)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to reach assistant. Try again.')
    })
  })

  it('disables input and button while loading', async () => {
    // Never-resolving promise to keep loading state
    ;(sendChatMessage as jest.Mock).mockReturnValue(new Promise(() => {}))

    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const input = screen.getByPlaceholderText(/Ask about this jurisdiction/)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByLabelText('Chat message input')).toBeDisabled()
      expect(screen.getByLabelText('Send message')).toBeDisabled()
    })
  })

  it('clears messages when jurisdictionId changes', async () => {
    ;(sendChatMessage as jest.Mock).mockResolvedValue({ reply: 'Response' })

    const { rerender } = render(
      <ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />,
    )
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const input = screen.getByPlaceholderText(/Ask about this jurisdiction/)
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument()
    })

    // Rerender with new jurisdiction
    rerender(
      <ChatPanel jurisdictionId="uuid-2" jurisdictionName="Arlington County, VA" />,
    )

    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.queryByText('Response')).not.toBeInTheDocument()
  })

  it('sends on Enter key', async () => {
    ;(sendChatMessage as jest.Mock).mockResolvedValue({ reply: 'Answer' })

    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const input = screen.getByPlaceholderText(/Ask about this jurisdiction/)
    fireEvent.change(input, { target: { value: 'Question' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledWith('uuid-1', 'Question', [])
    })
  })

  it('does not send empty messages', () => {
    render(<ChatPanel jurisdictionId="uuid-1" jurisdictionName="Fairfax County, VA" />)
    fireEvent.click(screen.getByText('Ask about Fairfax County, VA'))

    const sendButton = screen.getByLabelText('Send message')
    expect(sendButton).toBeDisabled()

    fireEvent.click(sendButton)
    expect(sendChatMessage).not.toHaveBeenCalled()
  })
})
