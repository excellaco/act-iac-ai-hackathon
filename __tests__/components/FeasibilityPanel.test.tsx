import { render, screen } from '@testing-library/react'
import FeasibilityPanel from '../../app/components/FeasibilityPanel'
import type { FeasibilityOutputs } from '../../lib/feasibility'

const baseFeasibility: FeasibilityOutputs = {
  maxUnitsPerAcre: 12,
  parkingFootprintPct: 18.2,
  estimatedCostPerUnit: 326_448,
  buildingType: 'garden',
  monthlyDebtService: 1341,
  requiredRent: 2579,
  fmr2br: 2280,
  rentFeasibility: 'Marginal',
}

describe('FeasibilityPanel', () => {
  it('renders Marginal state with amber color and background', () => {
    render(<FeasibilityPanel feasibility={baseFeasibility} />)
    const label = screen.getByText('Marginal')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#d97706' })
    // The parent card div carries the amber background
    expect(label.parentElement?.style.background).toBe('rgb(255, 251, 235)')
  })

  it('renders Feasible state with green color', () => {
    render(<FeasibilityPanel feasibility={{ ...baseFeasibility, rentFeasibility: 'Feasible' }} />)
    const label = screen.getByText('Feasible')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#16a34a' })
  })

  it('renders Infeasible state with red color and background', () => {
    render(<FeasibilityPanel feasibility={{ ...baseFeasibility, rentFeasibility: 'Infeasible' }} />)
    const label = screen.getByText('Infeasible')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#dc2626' })
    expect(label.parentElement?.style.background).toBe('rgb(254, 242, 242)')
  })

  it('renders required rent and FMR values in the note', () => {
    render(<FeasibilityPanel feasibility={baseFeasibility} />)
    expect(screen.getByText(/Required rent: \$2,579\/mo \(DSCR-based\) vs\. \$2,280 FMR 2BR/)).toBeInTheDocument()
  })

  it('renders building type label in cost card note', () => {
    render(<FeasibilityPanel feasibility={baseFeasibility} />)
    expect(screen.getByText(/Garden-style \(wood-frame\)/)).toBeInTheDocument()
  })
})
