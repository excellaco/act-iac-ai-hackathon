import type { ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import HeaderLogo from '../../app/components/HeaderLogo'

jest.mock('next/link', () => {
  function MockLink({ children, onClick, ...props }: { children: ReactNode; onClick?: () => void; href: string }) {
    return <a {...props} onClick={onClick}>{children}</a>
  }
  MockLink.displayName = 'MockLink'
  return MockLink
})

describe('HeaderLogo', () => {
  it('renders the logo image', () => {
    render(<HeaderLogo />)
    const img = screen.getByAltText('Parcella — return to home')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/parcella-logo.svg')
  })

  it('dispatches parcella:reset event on click', () => {
    const listener = jest.fn()
    window.addEventListener('parcella:reset', listener)

    try {
      render(<HeaderLogo />)
      fireEvent.click(screen.getByAltText('Parcella — return to home'))

      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('parcella:reset', listener)
    }
  })
})
