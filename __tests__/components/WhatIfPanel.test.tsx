import { render, screen, fireEvent } from '@testing-library/react'
import WhatIfPanel from '../../app/components/WhatIfPanel'
import { FAIRFAX } from '../fixtures/jurisdictionData'

const baseProps = {
  baselineRis: FAIRFAX.ris,
  baselineSubScores: {
    dci: FAIRFAX.subScores.dci.score,
    dcoi: FAIRFAX.subScores.dcoi.score,
    pci: FAIRFAX.subScores.pci.score,
    crp: FAIRFAX.subScores.crp.score,
  },
  fields: FAIRFAX.fields,
  baselineFeasibility: FAIRFAX.feasibility,
}

describe('WhatIfPanel', () => {
  it('renders baseline RIS score', () => {
    render(<WhatIfPanel {...baseProps} />)
    expect(screen.getByText('Baseline RIS')).toBeInTheDocument()
    // Both baseline and simulated show 73 initially — verify the label exists
    const baselineLabel = screen.getByText('Baseline RIS')
    const baselineValue = baselineLabel.parentElement?.querySelector('[class*="scoreItemValue"]')
    expect(baselineValue).toHaveTextContent('73')
  })

  it('renders all 5 slider controls', () => {
    render(<WhatIfPanel {...baseProps} />)
    expect(screen.getByLabelText('Parking minimum slider')).toBeInTheDocument()
    expect(screen.getByLabelText('Height limit slider')).toBeInTheDocument()
    expect(screen.getByLabelText('Density limit slider')).toBeInTheDocument()
    expect(screen.getByLabelText('Min. lot size slider')).toBeInTheDocument()
    expect(screen.getByLabelText('Front setback slider')).toBeInTheDocument()
  })

  it('renders feasibility output cards', () => {
    render(<WhatIfPanel {...baseProps} />)
    expect(screen.getByText('Max units/acre')).toBeInTheDocument()
    expect(screen.getByText('Parking footprint')).toBeInTheDocument()
    expect(screen.getByText('Cost per unit')).toBeInTheDocument()
    expect(screen.getByText('Rent feasibility')).toBeInTheDocument()
  })

  it('hides narrative section when no sliders have been moved', () => {
    render(<WhatIfPanel {...baseProps} />)
    expect(screen.queryByText(/Adjust the sliders/)).not.toBeInTheDocument()
  })

  it('updates simulated RIS when parking slider is changed', () => {
    render(<WhatIfPanel {...baseProps} />)
    const parkingSlider = screen.getByLabelText('Parking minimum slider')

    // Reduce parking from 2.0 to 0 — should lower the RIS (less restrictive)
    fireEvent.change(parkingSlider, { target: { value: '0' } })

    // The simulated RIS should differ from baseline
    const simulatedLabel = screen.getByText('Simulated RIS')
    const simulatedValue = simulatedLabel.parentElement?.querySelector('[class*="scoreItemValue"]')
    expect(simulatedValue).toBeInTheDocument()
    // With parking reduced to 0, DCOI drops, so simulated RIS should be below 73
    expect(simulatedValue?.textContent).not.toBe('73')
  })

  it('updates narrative text when a slider changes', () => {
    render(<WhatIfPanel {...baseProps} />)
    const parkingSlider = screen.getByLabelText('Parking minimum slider')

    fireEvent.change(parkingSlider, { target: { value: '0' } })

    // Narrative should describe the parking change
    expect(screen.getByText(/Reducing parking minimums/)).toBeInTheDocument()
    expect(screen.getByText(/Regulatory Impact Score/)).toBeInTheDocument()
  })

  it('shows reset button only when sliders have changed', () => {
    render(<WhatIfPanel {...baseProps} />)

    // No reset button at baseline
    expect(screen.queryByText('Reset to baseline values')).not.toBeInTheDocument()

    // Change a slider
    fireEvent.change(screen.getByLabelText('Height limit slider'), { target: { value: '200' } })
    expect(screen.getByText('Reset to baseline values')).toBeInTheDocument()
  })

  it('reset button restores all sliders to baseline values', () => {
    render(<WhatIfPanel {...baseProps} />)
    const parkingSlider = screen.getByLabelText('Parking minimum slider') as HTMLInputElement
    const heightSlider = screen.getByLabelText('Height limit slider') as HTMLInputElement

    // Change both sliders
    fireEvent.change(parkingSlider, { target: { value: '0' } })
    fireEvent.change(heightSlider, { target: { value: '200' } })
    expect(parkingSlider.value).toBe('0')
    expect(heightSlider.value).toBe('200')

    // Reset
    fireEvent.click(screen.getByText('Reset to baseline values'))

    // Verify sliders return to baseline
    expect(parkingSlider.value).toBe('2')
    expect(heightSlider.value).toBe('45')
    // Reset button should disappear
    expect(screen.queryByText('Reset to baseline values')).not.toBeInTheDocument()
  })

  it('does not mutate the baseline fields prop when sliders change', () => {
    // Deep clone the fields to detect mutation
    const originalFields = JSON.parse(JSON.stringify(FAIRFAX.fields))

    render(<WhatIfPanel {...baseProps} />)

    // Change every slider
    fireEvent.change(screen.getByLabelText('Parking minimum slider'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Height limit slider'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Density limit slider'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Min. lot size slider'), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText('Front setback slider'), { target: { value: '5' } })

    // The original prop object must be unchanged
    expect(FAIRFAX.fields).toEqual(originalFields)
  })

  it('does not mutate the baseline sub-scores prop when sliders change', () => {
    const originalSubScores = { ...baseProps.baselineSubScores }

    render(<WhatIfPanel {...baseProps} />)
    fireEvent.change(screen.getByLabelText('Parking minimum slider'), { target: { value: '0' } })

    expect(baseProps.baselineSubScores).toEqual(originalSubScores)
  })

  it('does not mutate the baseline feasibility prop when sliders change', () => {
    const originalFeasibility = { ...baseProps.baselineFeasibility }

    render(<WhatIfPanel {...baseProps} />)
    fireEvent.change(screen.getByLabelText('Parking minimum slider'), { target: { value: '0' } })

    expect(baseProps.baselineFeasibility).toEqual(originalFeasibility)
  })

  it('shows delta indicators when a slider value differs from baseline', () => {
    render(<WhatIfPanel {...baseProps} />)
    const parkingSlider = screen.getByLabelText('Parking minimum slider')

    fireEvent.change(parkingSlider, { target: { value: '0' } })

    // Should show the struck-through baseline value
    expect(screen.getByText(/2\.00 spaces\/unit/)).toBeInTheDocument()
  })

  it('prepends zone label to the narrative when zoneLabel prop is provided and a slider changes', () => {
    render(<WhatIfPanel {...baseProps} zoneLabel="RA6-15" />)

    // Move a slider to trigger the narrative update
    fireEvent.change(screen.getByLabelText('Parking minimum slider'), { target: { value: '0' } })

    expect(screen.getByText(/\[Simulating RA6-15\]/)).toBeInTheDocument()
  })

  it('does not show zone label prefix when zoneLabel is not provided', () => {
    render(<WhatIfPanel {...baseProps} />)
    expect(screen.queryByText(/Simulating/)).not.toBeInTheDocument()
  })
})
