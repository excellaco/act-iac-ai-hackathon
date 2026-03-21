import { render, screen } from '@testing-library/react'
import FeasibilityPanel from '../../app/components/FeasibilityPanel'
import type { FeasibilityOutputs } from '../../lib/feasibility'

const baseFeasibility: FeasibilityOutputs = {
  maxUnitsPerAcre: 12,
  parkingFootprintPct: 18.2,
  estimatedCostPerUnit: 251_600,
  monthlyCarryingCost: 1048,
  fmr2br: 2280,
  rentFeasibility: 'Feasible',
}

describe('FeasibilityPanel', () => {
  it('renders Feasible state with green color', () => {
    render(<FeasibilityPanel feasibility={baseFeasibility} />)
    const label = screen.getByText('Feasible')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#16a34a' })
  })

  it('renders Marginal state with amber color and background', () => {
    render(<FeasibilityPanel feasibility={{ ...baseFeasibility, rentFeasibility: 'Marginal' }} />)
    const label = screen.getByText('Marginal')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#d97706' })
    // The parent card div carries the amber background
    expect(label.parentElement?.style.background).toBe('rgb(255, 251, 235)')
  })

  it('renders Infeasible state with red color and background', () => {
    render(<FeasibilityPanel feasibility={{ ...baseFeasibility, rentFeasibility: 'Infeasible' }} />)
    const label = screen.getByText('Infeasible')
    expect(label).toBeInTheDocument()
    expect(label).toHaveStyle({ color: '#dc2626' })
    expect(label.parentElement?.style.background).toBe('rgb(254, 242, 242)')
  })

  it('renders the carrying cost and FMR values in the note', () => {
    render(<FeasibilityPanel feasibility={baseFeasibility} />)
    expect(screen.getByText(/1,048\/mo carrying vs\. \$2,280 FMR 2BR/)).toBeInTheDocument()
  })
})
