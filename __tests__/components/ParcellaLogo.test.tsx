import { render, screen } from '@testing-library/react'
import ParcellaLogo from '../../app/components/ParcellaLogo'

jest.mock('next/image', () => {
  function MockImage(props: { src: string; alt: string; width: number; height: number }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} width={props.width} height={props.height} />
  }
  MockImage.displayName = 'MockImage'
  return MockImage
})

describe('ParcellaLogo', () => {
  it('renders with default md size', () => {
    render(<ParcellaLogo />)
    const img = screen.getByAltText('Parcella')
    expect(img).toHaveAttribute('width', '133')
    expect(img).toHaveAttribute('height', '32')
  })

  it('renders sm size', () => {
    render(<ParcellaLogo size="sm" />)
    const img = screen.getByAltText('Parcella')
    expect(img).toHaveAttribute('width', '100')
    expect(img).toHaveAttribute('height', '24')
  })

  it('renders lg size', () => {
    render(<ParcellaLogo size="lg" />)
    const img = screen.getByAltText('Parcella')
    expect(img).toHaveAttribute('width', '200')
    expect(img).toHaveAttribute('height', '48')
  })
})
