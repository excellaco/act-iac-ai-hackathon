import { render, screen, fireEvent } from '@testing-library/react'
import PdfModal from '../../app/components/PdfModal'

describe('PdfModal', () => {
  const defaultProps = {
    jurisdictionId: 'uuid-1',
    sourcePage: 42,
    sourceSection: '§ 8102.04',
    fieldValueText: 'Two spaces per dwelling unit',
    onClose: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders dialog with section and quote', () => {
    render(<PdfModal {...defaultProps} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('§ 8102.04')).toBeInTheDocument()
    expect(screen.getByText('Two spaces per dwelling unit')).toBeInTheDocument()
  })

  it('renders iframe with correct PDF URL including page', () => {
    render(<PdfModal {...defaultProps} />)

    const iframe = screen.getByTitle('Source ordinance document')
    expect(iframe).toHaveAttribute('src', '/api/jurisdictions/uuid-1/pdf#page=42')
  })

  it('renders iframe without page hash when sourcePage is null', () => {
    render(<PdfModal {...defaultProps} sourcePage={null} />)

    const iframe = screen.getByTitle('Source ordinance document')
    expect(iframe).toHaveAttribute('src', '/api/jurisdictions/uuid-1/pdf')
  })

  it('hides section when sourceSection is null', () => {
    render(<PdfModal {...defaultProps} sourceSection={null} />)

    expect(screen.queryByText('§ 8102.04')).not.toBeInTheDocument()
  })

  it('hides quote when fieldValueText is "Not found in document"', () => {
    render(<PdfModal {...defaultProps} fieldValueText="Not found in document" />)

    expect(screen.queryByText('Not found in document')).not.toBeInTheDocument()
  })

  it('hides quote when fieldValueText is null', () => {
    render(<PdfModal {...defaultProps} fieldValueText={null} />)

    expect(screen.queryByText('Two spaces per dwelling unit')).not.toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    render(<PdfModal {...defaultProps} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    render(<PdfModal {...defaultProps} />)

    fireEvent.click(screen.getByLabelText('Close PDF viewer'))

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    const { container } = render(<PdfModal {...defaultProps} />)

    // The overlay div (role=dialog) contains a .modal and a .backdrop sibling
    // The backdrop is the second child of the overlay
    const dialog = container.querySelector('[role="dialog"]')!
    const backdrop = dialog.lastElementChild as HTMLElement
    fireEvent.click(backdrop)

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Enter is pressed on backdrop', () => {
    const { container } = render(<PdfModal {...defaultProps} />)

    const backdrop = container.querySelector('[role="dialog"]')!.lastElementChild as HTMLElement
    fireEvent.keyDown(backdrop, { key: 'Enter' })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Space is pressed on backdrop', () => {
    const { container } = render(<PdfModal {...defaultProps} />)

    const backdrop = container.querySelector('[role="dialog"]')!.lastElementChild as HTMLElement
    fireEvent.keyDown(backdrop, { key: ' ' })

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})
