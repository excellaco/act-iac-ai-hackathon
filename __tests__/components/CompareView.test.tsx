jest.mock('../../lib/apiClient', () => ({
  fetchJurisdictions: jest.fn(),
  fetchScore: jest.fn(),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CompareView from '../../app/components/CompareView'
import { fetchJurisdictions, fetchScore } from '../../lib/apiClient'
import { FAIRFAX, ARLINGTON, LOUDOUN, ARLINGTON_WITH_ZONES } from '../fixtures/jurisdictionData'

// Mock API responses for AddCard
const mockJurisdictionList = [
  { id: 'uuid-fairfax',   name: 'Fairfax County',   state: 'VA', displayName: 'Fairfax County, VA',   dataType: 'real', risComposite: '73' },
  { id: 'uuid-arlington', name: 'Arlington County', state: 'VA', displayName: 'Arlington County, VA', dataType: 'real', risComposite: '43' },
  { id: 'uuid-loudoun',   name: 'Loudoun County',   state: 'VA', displayName: 'Loudoun County, VA',   dataType: 'real', risComposite: '65' },
]

const mockScoreResponse = {
  jurisdiction: { id: 'uuid-loudoun', name: 'Loudoun County', state: 'VA', slug: 'loudoun', dataType: 'real' },
  score: { risComposite: '65', dci: '80', dcoi: '55', pci: '60', crp: '60' },
  extractedFields: [],
}

describe('CompareView', () => {
  const mockOnBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchJurisdictions as jest.Mock).mockResolvedValue(mockJurisdictionList);
    (fetchScore as jest.Mock).mockResolvedValue(mockScoreResponse)
  })

  it('renders the initial jurisdiction card', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    // Wait for AddCard's async fetchJurisdictions to settle
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.getByText('Fairfax County')).toBeInTheDocument()
    expect(screen.getByText('73')).toBeInTheDocument()
  })

  it('renders both jurisdictions when initialPeer is provided', async () => {
    render(<CompareView initial={FAIRFAX} initialPeer={ARLINGTON} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    // Names appear in both the ranking bar and cards — use getAllByText
    expect(screen.getAllByText('Fairfax County').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Arlington County').length).toBeGreaterThanOrEqual(1)
  })

  it('does not show ranking bar with only one jurisdiction', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.queryByText('#1')).not.toBeInTheDocument()
  })

  it('shows the Add a jurisdiction card when fewer than 3 jurisdictions', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.getByText('Add a jurisdiction')).toBeInTheDocument()
  })

  it('back button calls onBack', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    fireEvent.click(screen.getByText('← Back to score panel'))
    expect(mockOnBack).toHaveBeenCalledTimes(1)
  })

  it('remove button removes a jurisdiction card', async () => {
    render(<CompareView initial={FAIRFAX} initialPeer={ARLINGTON} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    // Remove Arlington
    fireEvent.click(screen.getByLabelText('Remove Arlington County'))
    await waitFor(() => {
      expect(screen.queryByText('Arlington County')).not.toBeInTheDocument()
    })
    // Fairfax should still be there
    expect(screen.getByText('Fairfax County')).toBeInTheDocument()
  })

  it('cannot remove the last jurisdiction — falls back to initial', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    // Try to remove the only jurisdiction
    fireEvent.click(screen.getByLabelText('Remove Fairfax County'))

    // Should fall back to initial — Fairfax still shown
    await waitFor(() => {
      expect(screen.getByText('Fairfax County')).toBeInTheDocument()
    })
  })

  it('displays sub-score bars for each jurisdiction card', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.getByText('Density (DCI)')).toBeInTheDocument()
    expect(screen.getByText('Cost (DCOI)')).toBeInTheDocument()
    expect(screen.getByText('Permitting (PCI)')).toBeInTheDocument()
    expect(screen.getByText('Peer Rank (CRP)')).toBeInTheDocument()
  })

  it('displays regulatory field values in the card', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.getByText('12 units/acre')).toBeInTheDocument()
    expect(screen.getByText('45 ft')).toBeInTheDocument()
    expect(screen.getByText('2 spaces/unit')).toBeInTheDocument()
    expect(screen.getByText(/special use permit/i)).toBeInTheDocument()
  })

  it('filters AddCard dropdown options by search query', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    const searchInput = screen.getByPlaceholderText('Search jurisdictions…')
    fireEvent.change(searchInput, { target: { value: 'loudoun' } })

    await waitFor(() => expect(screen.getByText('Loudoun County, VA')).toBeInTheDocument())
    expect(screen.queryByText('Arlington County, VA')).not.toBeInTheDocument()
  })

  it('adds a jurisdiction card when an AddCard dropdown result is selected', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('Search jurisdictions…'), {
      target: { value: 'loudoun' },
    })
    await waitFor(() => screen.getByText('Loudoun County, VA'))
    fireEvent.click(screen.getByText('Loudoun County, VA'))

    await waitFor(() => expect(fetchScore).toHaveBeenCalledWith('uuid-loudoun'))
  })
})

describe('CompareView — ZoneSelector per card (E2-155)', () => {
  const mockOnBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchJurisdictions as jest.Mock).mockResolvedValue([]);
    (fetchScore as jest.Mock).mockResolvedValue({})
  })

  it('does not show zone selector in card for jurisdiction with no zones', async () => {
    render(<CompareView initial={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.queryByRole('combobox', { name: 'Select zoning district' })).not.toBeInTheDocument()
  })

  it('shows zone selector in card for jurisdiction with zones', async () => {
    render(<CompareView initial={ARLINGTON_WITH_ZONES} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    expect(screen.getByRole('combobox', { name: 'Select zoning district' })).toBeInTheDocument()
  })

  it('each card has an independent zone selector', async () => {
    render(<CompareView initial={ARLINGTON_WITH_ZONES} initialPeer={FAIRFAX} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    // Only Arlington (which has zones) should show a zone selector
    const selectors = screen.getAllByRole('combobox', { name: 'Select zoning district' })
    expect(selectors).toHaveLength(1)
  })

  it('changing zone selection in one card does not affect other cards', async () => {
    render(
      <CompareView initial={ARLINGTON_WITH_ZONES} initialPeer={ARLINGTON_WITH_ZONES} onBack={mockOnBack} />
    )
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    const [firstSelect] = screen.getAllByRole('combobox', { name: 'Select zoning district' }) as HTMLSelectElement[]

    // Change first card to R-10
    fireEvent.change(firstSelect, { target: { value: 'R-10' } })
    expect(firstSelect.value).toBe('R-10')

    // Second card should still be on its default (all zones averaged)
    const [, secondSelect] = screen.getAllByRole('combobox', { name: 'Select zoning district' }) as HTMLSelectElement[]
    expect(secondSelect.value).toBe('__avg__')
  })
})
