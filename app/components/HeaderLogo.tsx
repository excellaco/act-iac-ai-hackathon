'use client'

import Link from 'next/link'

/**
 * Client-side header logo that resets app state on click.
 * Dispatches a custom 'parcella:reset' event that page.tsx listens for.
 */
export default function HeaderLogo() {
  function handleClick() {
    window.dispatchEvent(new Event('parcella:reset'))
  }

  return (
    <Link href="/" onClick={handleClick} className="app-logo-link">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/parcella-logo.svg" alt="Parcella — return to home" height="28" className="app-logo" />
    </Link>
  )
}
