import { render, screen, fireEvent } from '@testing-library/react'
import ScorePanel from '../../app/components/ScorePanel'
import { FAIRFAX, ARLINGTON_WITH_ZONES } from '../fixtures/jurisdictionData'

describe('ScorePanel', () => {
  const mockOnCompare = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the jurisdiction name and state', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument()
  })

  it('renders the composite RIS score', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    // The RIS score badge
    expect(screen.getByText('73')).toBeInTheDocument()
    expect(screen.getByText('High Restrictiveness')).toBeInTheDocument()
  })

  it('renders all 4 sub-score accordions', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.getByText('Density Constraint Index')).toBeInTheDocument()
    expect(screen.getByText('Development Cost Impact')).toBeInTheDocument()
    expect(screen.getByText('Permitting Complexity Indicator')).toBeInTheDocument()
    expect(screen.getByText('Comparative Restrictiveness')).toBeInTheDocument()
  })

  it('renders confidence badges on sub-scores', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    // Fairfax has 3 High and 1 Medium confidence
    const highBadges = screen.getAllByText('High')
    const mediumBadges = screen.getAllByText('Medium')
    expect(highBadges.length).toBe(3)
    expect(mediumBadges.length).toBe(1)
  })

  it('accordion expands to show description and source on click', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)

    // Click the DCI accordion summary
    fireEvent.click(screen.getByText('Density Constraint Index'))

    // Should show the description and source
    expect(screen.getByText(/restrictions on lot size, height, density/)).toBeInTheDocument()
    expect(screen.getByText(/Municode zoning code/)).toBeInTheDocument()
  })

  it('shows disclaimer in methodology modal', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    fireEvent.click(screen.getByText('About this score'))
    expect(screen.getByText(/does not recommend any policy position/)).toBeInTheDocument()
  })

  it('What-If toggle is off by default', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.getByText('What-If Simulation')).toBeInTheDocument()
    // The WhatIfPanel sliders should not be visible
    expect(screen.queryByLabelText('Parking minimum slider')).not.toBeInTheDocument()
  })

  it('What-If toggle shows WhatIfPanel when enabled', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)

    // Toggle on
    const toggle = screen.getByLabelText('Toggle What-If Simulation')
    fireEvent.click(toggle)

    // WhatIfPanel should now be visible
    expect(screen.getByLabelText('Parking minimum slider')).toBeInTheDocument()
    expect(screen.getByText('Baseline RIS')).toBeInTheDocument()
  })

  it('What-If toggle hides WhatIfPanel when disabled', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)

    // Toggle on then off
    const toggle = screen.getByLabelText('Toggle What-If Simulation')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Parking minimum slider')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.queryByLabelText('Parking minimum slider')).not.toBeInTheDocument()
  })

  it('About this score link opens methodology modal', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    fireEvent.click(screen.getByText('About this score'))
    // MethodologyModal has a dialog role and specific title
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('About the Regulatory Impact Score')).toBeInTheDocument()
  })

  it('renders the feasibility panel with cost and rent data', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.getByText('Development Feasibility')).toBeInTheDocument()
    expect(screen.getByText('Max Unit Yield')).toBeInTheDocument()
  })
})

describe('ScorePanel — PDF citations', () => {
  const mockOnCompare = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Fairfax fixture with citations that have source data
  const FAIRFAX_WITH_CITATIONS = {
    ...FAIRFAX,
    citations: {
      min_lot_size_sqft: {
        fieldValueText: 'One acre minimum lot size',
        sourceSection: '§ 4-102',
        sourcePage: 42,
        sourceDocument: 'gs://test/fairfax.pdf',
        confidence: 'high',
        reasoning: null,
        usingDefault: false,
      },
      parking_min_spaces_per_unit: {
        fieldValueText: 'Two spaces per dwelling unit',
        sourceSection: '§ 8102.04',
        sourcePage: 87,
        sourceDocument: 'gs://test/fairfax.pdf',
        confidence: 'high',
        reasoning: null,
        usingDefault: false,
      },
    },
  }

  it('shows citation quotes when accordion is expanded', () => {
    render(<ScorePanel jurisdiction={FAIRFAX_WITH_CITATIONS} onCompare={mockOnCompare} />)

    const accordionHeader = screen.getByText('Density Constraint Index')
    fireEvent.click(accordionHeader)

    expect(accordionHeader.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/One acre minimum lot size/)).toBeInTheDocument()
  })

  it('shows "View source" buttons for citations with source data', () => {
    render(<ScorePanel jurisdiction={FAIRFAX_WITH_CITATIONS} onCompare={mockOnCompare} />)

    fireEvent.click(screen.getByText('Density Constraint Index'))

    expect(screen.getAllByText('View source').length).toBeGreaterThanOrEqual(1)
  })

  it('opens PdfModal when "View source" is clicked', () => {
    render(<ScorePanel jurisdiction={FAIRFAX_WITH_CITATIONS} onCompare={mockOnCompare} />)

    fireEvent.click(screen.getByText('Density Constraint Index'))
    fireEvent.click(screen.getAllByText('View source')[0])

    expect(screen.getByRole('dialog', { name: 'Source document' })).toBeInTheDocument()
    expect(screen.getByText('§ 4-102')).toBeInTheDocument()
  })

  it('closes PdfModal when close button is clicked', () => {
    render(<ScorePanel jurisdiction={FAIRFAX_WITH_CITATIONS} onCompare={mockOnCompare} />)

    fireEvent.click(screen.getByText('Density Constraint Index'))
    fireEvent.click(screen.getAllByText('View source')[0])
    expect(screen.getByRole('dialog', { name: 'Source document' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close PDF viewer'))
    expect(screen.queryByRole('dialog', { name: 'Source document' })).not.toBeInTheDocument()
  })
})

describe('ScorePanel — ZoneSelector (E2-155)', () => {
  const mockOnCompare = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not show zone selector when jurisdiction has no zones', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.queryByRole('combobox', { name: 'Select zoning district' })).not.toBeInTheDocument()
  })

  it('shows zone selector when jurisdiction has zones', () => {
    render(<ScorePanel jurisdiction={ARLINGTON_WITH_ZONES} onCompare={mockOnCompare} />)
    expect(screen.getByRole('combobox', { name: 'Select zoning district' })).toBeInTheDocument()
  })

  it('defaults to all zones averaged', () => {
    render(<ScorePanel jurisdiction={ARLINGTON_WITH_ZONES} onCompare={mockOnCompare} />)
    const select = screen.getByRole('combobox', { name: 'Select zoning district' }) as HTMLSelectElement
    expect(select.value).toBe('__avg__')
  })

  it('updates the displayed RIS when a different zone is selected', () => {
    render(<ScorePanel jurisdiction={ARLINGTON_WITH_ZONES} onCompare={mockOnCompare} />)

    // Switch to R-10 (risComposite: 72)
    fireEvent.change(screen.getByRole('combobox', { name: 'Select zoning district' }), {
      target: { value: 'R-10' },
    })

    // The score badge should update to 72 (multiple elements may contain this value)
    expect(screen.getAllByText('72').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "__avg__" option as "All zones (averaged)"', () => {
    render(<ScorePanel jurisdiction={ARLINGTON_WITH_ZONES} onCompare={mockOnCompare} />)
    expect(screen.getByRole('option', { name: 'All zones (averaged)' })).toBeInTheDocument()
  })
})
