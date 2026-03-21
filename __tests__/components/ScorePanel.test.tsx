import { render, screen, fireEvent } from '@testing-library/react'
import ScorePanel from '../../app/components/ScorePanel'
import { FAIRFAX } from '../fixtures/jurisdictionData'

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

  it('renders the disclaimer', () => {
    render(<ScorePanel jurisdiction={FAIRFAX} onCompare={mockOnCompare} />)
    expect(screen.getByText(/does not recommend policy positions/)).toBeInTheDocument()
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
