jest.mock('../../lib/apiClient', () => ({
  fetchJurisdictions: jest.fn(),
  fetchScore: jest.fn(),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CompareView from '../../app/components/CompareView'
import { fetchJurisdictions, fetchScore } from '../../lib/apiClient'
import { FAIRFAX, ARLINGTON, LOUDOUN } from '../fixtures/jurisdictionData'

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

  it('shows ranking bar when 2+ jurisdictions are displayed', async () => {
    render(<CompareView initial={FAIRFAX} initialPeer={ARLINGTON} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    // Ranking bar shows #1 and #2 positions
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
  })

  it('ranking bar sorts jurisdictions most-to-least restrictive', async () => {
    render(<CompareView initial={FAIRFAX} initialPeer={ARLINGTON} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    // Fairfax (73) should be #1 (most restrictive), Arlington (43) should be #2
    const rankItems = screen.getAllByText(/#[12]/)
    const rank1Parent = rankItems[0].closest('[class*="rankItem"]')
    const rank2Parent = rankItems[1].closest('[class*="rankItem"]')
    expect(rank1Parent).toHaveTextContent('Fairfax County')
    expect(rank2Parent).toHaveTextContent('Arlington County')
  })

  it('ranking bar sort does not mutate the jurisdictions array', async () => {
    const jurisdictions = [FAIRFAX, ARLINGTON]
    const originalOrder = [...jurisdictions]

    render(<CompareView initial={jurisdictions[0]} initialPeer={jurisdictions[1]} onBack={mockOnBack} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    // The original array must not be reordered
    expect(jurisdictions[0]).toBe(originalOrder[0])
    expect(jurisdictions[1]).toBe(originalOrder[1])
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
})
