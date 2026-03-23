import { render, screen } from '@testing-library/react'
import ZoneOverlay from '../../app/components/ZoneOverlay'
import type { ZoneScore } from '../../lib/mockData'

const mockZones: ZoneScore[] = [
  {
    zoneCode: 'RA6-15',
    zoneName: 'Residential Apartment',
    multifamilyClassification: 'primary',
    dci: 40, dcoi: 50, pci: 35, crp: 45, risComposite: 43,
    fields: { densityLimitUpa: 72 },
    citations: {},
    feasibility: null,
  },
  {
    zoneCode: 'R-10',
    zoneName: null,
    multifamilyClassification: 'limited',
    dci: 80, dcoi: 60, pci: 70, crp: 65, risComposite: 72,
    fields: { densityLimitUpa: 4 },
    citations: {},
    feasibility: null,
  },
  {
    zoneCode: 'MU-V',
    zoneName: 'Mixed Use Village',
    multifamilyClassification: 'permitted',
    dci: 55, dcoi: 45, pci: 40, crp: 50, risComposite: 50,
    fields: { densityLimitUpa: 30 },
    citations: {},
    feasibility: null,
  },
]

describe('ZoneOverlay', () => {
  it('returns null when zones array is empty', () => {
    const { container } = render(<ZoneOverlay zones={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the overlay with title, zone count, and ARIA role', () => {
    render(<ZoneOverlay zones={mockZones} />)
    expect(screen.getByText('Zoning Districts')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Zoning districts legend' })).toBeInTheDocument()
  })

  it('renders a row for each zone', () => {
    render(<ZoneOverlay zones={mockZones} />)
    expect(screen.getByText('RA6-15')).toBeInTheDocument()
    expect(screen.getByText('R-10')).toBeInTheDocument()
    expect(screen.getByText('MU-V')).toBeInTheDocument()
  })

  it('shows zone name when available and omits it when null', () => {
    render(<ZoneOverlay zones={mockZones} />)
    const overlay = screen.getByTestId('zone-overlay')
    const zoneNameElements = Array.from(overlay.querySelectorAll('[class*="zoneName"]'))
    const zoneNames = zoneNameElements.map((el) => el.textContent)
    // Only the two non-null zone names should be rendered (sorted by RIS desc)
    expect(zoneNames).toEqual(['Mixed Use Village', 'Residential Apartment'])
  })

  it('displays classification badges for each zone', () => {
    render(<ZoneOverlay zones={mockZones} />)
    expect(screen.getByText('Primary MF')).toBeInTheDocument()
    expect(screen.getByText('Limited')).toBeInTheDocument()
    expect(screen.getByText('Permitted')).toBeInTheDocument()
  })

  it('displays RIS scores for each zone', () => {
    render(<ZoneOverlay zones={mockZones} />)
    expect(screen.getByText('43')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('renders raw classification key and default styling for unknown classification', () => {
    const unknownZone: ZoneScore = {
      ...mockZones[0],
      multifamilyClassification: 'conditional' as ZoneScore['multifamilyClassification'],
    }
    render(<ZoneOverlay zones={[unknownZone]} />)
    expect(screen.getByText('conditional')).toBeInTheDocument()
  })

  it('sorts zones by risComposite descending', () => {
    render(<ZoneOverlay zones={mockZones} />)
    const overlay = screen.getByTestId('zone-overlay')
    const zoneCodes = Array.from(overlay.querySelectorAll('[class*="zoneCode"]'))
      .map((el) => el.textContent)
    // R-10 (72), MU-V (50), RA6-15 (43)
    expect(zoneCodes).toEqual(['R-10', 'MU-V', 'RA6-15'])
  })
})
