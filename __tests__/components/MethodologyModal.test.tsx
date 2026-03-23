import { render, screen, fireEvent } from '@testing-library/react'
import MethodologyModal from '../../app/components/MethodologyModal'

describe('MethodologyModal', () => {
  it('renders with dialog role and title', () => {
    render(<MethodologyModal onClose={jest.fn()} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('About the Regulatory Impact Score')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn()
    render(<MethodologyModal onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn()
    render(<MethodologyModal onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose on non-Escape keys', () => {
    const onClose = jest.fn()
    render(<MethodologyModal onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Enter' })

    expect(onClose).not.toHaveBeenCalled()
  })
})
