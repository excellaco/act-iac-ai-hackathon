import { render, screen, fireEvent } from '@testing-library/react'
import ZoneSelector from '../../app/components/ZoneSelector'
import type { ZoneScore } from '../../lib/mockData'

const mockZones: ZoneScore[] = [
  {
    zoneCode: 'RA6-15',
    zoneName: 'Residential Apartment',
    multifamilyClassification: 'primary',
    dci: 40, dcoi: 50, pci: 35, crp: 45, risComposite: 43,
    fields: { densityLimitUpa: 72, parkingMinSpacesPerUnit: 0.5 },
    citations: {},
    feasibility: null,
  },
  {
    zoneCode: 'R-10',
    zoneName: 'Single Family Residential',
    multifamilyClassification: 'limited',
    dci: 80, dcoi: 60, pci: 70, crp: 65, risComposite: 72,
    fields: { densityLimitUpa: 4, parkingMinSpacesPerUnit: 2.0 },
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

describe('ZoneSelector', () => {
  it('returns null when zones array is empty', () => {
    const { container } = render(
      <ZoneSelector zones={[]} selectedZoneCode="__avg__" onChange={jest.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the select element when zones are provided', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Select zoning district' })).toBeInTheDocument()
  })

  it('includes "All zones (averaged)" as the first option', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('All zones (averaged)')
    expect(options[0]).toHaveValue('__avg__')
  })

  it('renders one option per zone plus the averaged option', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    expect(screen.getAllByRole('option')).toHaveLength(mockZones.length + 1)
  })

  it('sorts zone options by risComposite descending', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    const options = screen.getAllByRole('option')
    // Skip first ("All zones"), remaining should be R-10 (72), MU-V (50), RA6-15 (43)
    expect(options[1]).toHaveValue('R-10')
    expect(options[2]).toHaveValue('MU-V')
    expect(options[3]).toHaveValue('RA6-15')
  })

  it('sets the correct selected value', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="RA6-15" onChange={jest.fn()} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('RA6-15')
  })

  it('calls onChange with the new zone code when selection changes', () => {
    const handleChange = jest.fn()
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={handleChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'RA6-15' } })
    expect(handleChange).toHaveBeenCalledWith('RA6-15')
  })

  it('shows a classification badge when a specific zone is selected', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="RA6-15" onChange={jest.fn()} />)
    expect(screen.getByText('Primary MF')).toBeInTheDocument()
  })

  it('does not show a classification badge when "__avg__" is selected', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    expect(screen.queryByText('Primary MF')).not.toBeInTheDocument()
    expect(screen.queryByText('Limited')).not.toBeInTheDocument()
  })

  it('renders the optional label when provided', () => {
    render(
      <ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} label="Zone" />
    )
    expect(screen.getByText('Zone')).toBeInTheDocument()
  })

  it('does not render the label element when label prop is omitted', () => {
    render(<ZoneSelector zones={mockZones} selectedZoneCode="__avg__" onChange={jest.fn()} />)
    // Only the select and (optionally) badge should be in the wrapper — no extra text node
    expect(screen.queryByText('Zone')).not.toBeInTheDocument()
  })
})
