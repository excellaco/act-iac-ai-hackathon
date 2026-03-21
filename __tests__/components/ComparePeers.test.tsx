jest.mock('../../lib/apiClient', () => ({
  fetchJurisdictions: jest.fn(),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ComparePeers from '../../app/components/ComparePeers'
import { fetchJurisdictions } from '../../lib/apiClient'
import { FAIRFAX } from '../fixtures/jurisdictionData'

const mockPeers = [
  { id: 'uuid-arlington',  name: 'Arlington County',  state: 'VA', dataType: 'real', risComposite: '43' },
  { id: 'uuid-loudoun',    name: 'Loudoun County',    state: 'VA', dataType: 'real', risComposite: '65' },
  { id: 'uuid-howard',     name: 'Howard County',     state: 'MD', dataType: 'real', risComposite: '63' },
  { id: 'uuid-montgomery', name: 'Montgomery County', state: 'MD', dataType: 'real', risComposite: '58' },
]

describe('ComparePeers', () => {
  const mockOnCompare = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchJurisdictions as jest.Mock).mockResolvedValue(mockPeers)
  })

  it('renders the top 3 peer chips after data loads', async () => {
    render(<ComparePeers current={FAIRFAX} onCompare={mockOnCompare} />)
    // Sorted ascending by risComposite: Arlington(43), Montgomery(58), Howard(63)
    await waitFor(() => expect(screen.getByText('Arlington County')).toBeInTheDocument())
    expect(screen.getByText('Montgomery County')).toBeInTheDocument()
    expect(screen.getByText('Howard County')).toBeInTheDocument()
    // Loudoun(65) is 4th — should not appear as a chip
    expect(screen.queryByText('Loudoun County')).not.toBeInTheDocument()
  })

  it('calls onCompare with correct data when a peer chip is clicked', async () => {
    render(<ComparePeers current={FAIRFAX} onCompare={mockOnCompare} />)
    await waitFor(() => screen.getByTitle('Compare with Arlington County, VA'))
    fireEvent.click(screen.getByTitle('Compare with Arlington County, VA'))
    expect(mockOnCompare).toHaveBeenCalledWith({
      id: 'uuid-arlington',
      name: 'Arlington County',
      state: 'VA',
      ris: 43,
    })
  })

  it('filters peers when typing in the search input', async () => {
    render(<ComparePeers current={FAIRFAX} onCompare={mockOnCompare} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('Add a jurisdiction to compare…'), {
      target: { value: 'loudoun' },
    })
    await waitFor(() => expect(screen.getByText('Loudoun County, VA')).toBeInTheDocument())
    expect(screen.queryByText('Howard County, MD')).not.toBeInTheDocument()
  })

  it('calls onCompare and clears search when a dropdown result is clicked', async () => {
    render(<ComparePeers current={FAIRFAX} onCompare={mockOnCompare} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())

    const input = screen.getByPlaceholderText('Add a jurisdiction to compare…')
    fireEvent.change(input, { target: { value: 'loudoun' } })
    await waitFor(() => screen.getByText('Loudoun County, VA'))

    fireEvent.click(screen.getByText('Loudoun County, VA'))

    expect(mockOnCompare).toHaveBeenCalledWith({
      id: 'uuid-loudoun',
      name: 'Loudoun County',
      state: 'VA',
      ris: 65,
    })
    expect(input).toHaveValue('')
  })

  it('shows no results message when search has no matches', async () => {
    render(<ComparePeers current={FAIRFAX} onCompare={mockOnCompare} />)
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('Add a jurisdiction to compare…'), {
      target: { value: 'xyznotaplace' },
    })
    await waitFor(() =>
      expect(screen.getByText('No matching jurisdictions found.')).toBeInTheDocument()
    )
  })
})
