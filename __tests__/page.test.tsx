jest.mock('../lib/apiClient', () => ({
  fetchJurisdictions: jest.fn(),
  fetchScore: jest.fn(),
}))

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Home from '../app/page';
import { fetchJurisdictions, fetchScore } from '../lib/apiClient';

const mockJurisdictions = [
  { id: 'uuid-fairfax',   name: 'Fairfax County',   state: 'VA', displayName: 'Fairfax County, VA',   dataType: 'real', risComposite: '73' },
  { id: 'uuid-arlington', name: 'Arlington County', state: 'VA', displayName: 'Arlington County, VA', dataType: 'real', risComposite: '43' },
  { id: 'uuid-loudoun',   name: 'Loudoun County',   state: 'VA', displayName: 'Loudoun County, VA',   dataType: 'real', risComposite: '65' },
  { id: 'uuid-howard',    name: 'Howard County',    state: 'MD', displayName: 'Howard County, MD',    dataType: 'synthetic', risComposite: '63' },
]

const mockScoreResponse = {
  jurisdiction: { id: 'uuid-fairfax', name: 'Fairfax County', state: 'VA', slug: 'fairfax_va', displayName: 'Fairfax County, VA', dataType: 'real' },
  score: { risComposite: '73', dci: '75', dcoi: '70', pci: '65', crp: '80', scoredAt: new Date().toISOString() },
  extractedFields: [],
}

describe('Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchJurisdictions as jest.Mock).mockReset().mockResolvedValue(mockJurisdictions);
    (fetchScore as jest.Mock).mockReset().mockResolvedValue(mockScoreResponse);
  })

  it('renders the search bar', async () => {
    render(<Home />);
    // waitFor lets the async fetchJurisdictions effect settle inside act()
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Find your county or municipality')).toBeInTheDocument();
  });

  it('renders the heading before the search in the DOM', async () => {
    render(<Home />);
    await waitFor(() => expect(fetchJurisdictions).toHaveBeenCalled());
    const heading = screen.getByRole('heading', { name: 'Parcella' });
    const searchInput = screen.getByPlaceholderText('Find your county or municipality');
    expect(heading.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows all jurisdiction options on focus after API loads', async () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    await waitFor(() => expect(screen.getByText('Fairfax County')).toBeInTheDocument());
    expect(screen.getByText('Arlington County')).toBeInTheDocument();
    expect(screen.getByText('Loudoun County')).toBeInTheDocument();
    expect(screen.getByText('Howard County')).toBeInTheDocument();
  });

  it('filters autocomplete options by query', async () => {
    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText('Find your county or municipality'), {
      target: { value: 'arling' },
    });
    await waitFor(() => expect(screen.getByText('Arlington County')).toBeInTheDocument());
    expect(screen.queryByText('Fairfax County')).not.toBeInTheDocument();
  });

  it('shows score panel after selecting a jurisdiction', async () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    await waitFor(() => screen.getByText('Fairfax County'));
    fireEvent.mouseDown(screen.getByText('Fairfax County'));
    await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());
    expect(screen.getByText('Density Constraint Index')).toBeInTheDocument();
  });

  it('preserves the selected jurisdiction in the visible search input', async () => {
    render(<Home />);
    const searchInput = screen.getByPlaceholderText('Find your county or municipality');
    fireEvent.focus(searchInput);
    await waitFor(() => screen.getByText('Fairfax County'));
    fireEvent.mouseDown(screen.getByText('Fairfax County'));
    await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());
    expect(searchInput).toHaveValue('Fairfax County, VA');
    expect(screen.getByPlaceholderText('Find your county or municipality')).toBe(searchInput);
  });

  it('restores the previous selection and shows an error when a new score load fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    (fetchScore as jest.Mock)
      .mockResolvedValueOnce(mockScoreResponse)
      .mockRejectedValueOnce(new Error('boom'));

    try {
      render(<Home />);

      const searchInput = screen.getByPlaceholderText('Find your county or municipality');
      fireEvent.focus(searchInput);
      await waitFor(() => screen.getByText('Fairfax County'));
      fireEvent.mouseDown(screen.getByText('Fairfax County'));
      await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());

      fireEvent.change(searchInput, { target: { value: 'arling' } });
      const searchResults = searchInput.parentElement as HTMLElement;
      await waitFor(() => expect(within(searchResults).getByText('Arlington County')).toBeInTheDocument());
      fireEvent.mouseDown(within(searchResults).getByText('Arlington County'));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load jurisdiction score. Try again.')
      );
      expect(searchInput).toHaveValue('Fairfax County, VA');
      expect(screen.getByText('Density Constraint Index')).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('typing in the search clears a previous load error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    (fetchScore as jest.Mock)
      .mockResolvedValueOnce(mockScoreResponse)
      .mockRejectedValueOnce(new Error('boom'));

    try {
      render(<Home />);
      const searchInput = screen.getByPlaceholderText('Find your county or municipality');

      // Load Fairfax successfully
      fireEvent.focus(searchInput);
      await waitFor(() => screen.getByText('Fairfax County'));
      fireEvent.mouseDown(screen.getByText('Fairfax County'));
      await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());

      // Select Arlington — this will fail
      fireEvent.change(searchInput, { target: { value: 'arling' } });
      const searchResults = searchInput.parentElement as HTMLElement;
      await waitFor(() => expect(within(searchResults).getByText('Arlington County')).toBeInTheDocument());
      fireEvent.mouseDown(within(searchResults).getByText('Arlington County'));
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

      // Typing should clear the error
      fireEvent.change(searchInput, { target: { value: 'fa' } });
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    } finally {
      consoleError.mockRestore();
    }
  });

  it('shows an error when the score response contains no score data', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    (fetchScore as jest.Mock).mockResolvedValueOnce({
      jurisdiction: { id: 'uuid-fairfax', name: 'Fairfax County', state: 'VA', slug: 'fairfax_va', dataType: 'real' },
      score: null,
      extractedFields: [],
    });

    try {
      render(<Home />);
      fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
      await waitFor(() => screen.getByText('Fairfax County'));
      fireEvent.mouseDown(screen.getByText('Fairfax County'));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Failed to load jurisdiction score. Try again.')
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('enters compare mode when a peer chip is clicked', async () => {
    render(<Home />);
    const searchInput = screen.getByPlaceholderText('Find your county or municipality');

    // Select Fairfax to load the score panel
    fireEvent.focus(searchInput);
    await waitFor(() => screen.getByText('Fairfax County'));
    fireEvent.mouseDown(screen.getByText('Fairfax County'));
    await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());

    // Wait for ComparePeers to load and display a peer chip
    await waitFor(() => screen.getByTitle('Compare with Arlington County, VA'));
    fireEvent.click(screen.getByTitle('Compare with Arlington County, VA'));

    // CompareView should now be rendered
    await waitFor(() =>
      expect(screen.getByText('← Back to score panel')).toBeInTheDocument()
    );
  });

  it('returns to score panel when back button is clicked in compare mode', async () => {
    render(<Home />);
    const searchInput = screen.getByPlaceholderText('Find your county or municipality');

    fireEvent.focus(searchInput);
    await waitFor(() => screen.getByText('Fairfax County'));
    fireEvent.mouseDown(screen.getByText('Fairfax County'));
    await waitFor(() => expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument());

    await waitFor(() => screen.getByTitle('Compare with Arlington County, VA'));
    fireEvent.click(screen.getByTitle('Compare with Arlington County, VA'));
    await waitFor(() => expect(screen.getByText('← Back to score panel')).toBeInTheDocument());

    fireEvent.click(screen.getByText('← Back to score panel'));
    await waitFor(() =>
      expect(screen.queryByText('← Back to score panel')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument();
  });

  it('shows disclaimer in methodology modal', async () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    await waitFor(() => screen.getByText('Arlington County'));
    fireEvent.mouseDown(screen.getByText('Arlington County'));
    await waitFor(() => screen.getByText('About this score'));
    fireEvent.click(screen.getByText('About this score'));
    await waitFor(() =>
      expect(screen.getByText(/does not recommend any policy position/i)).toBeInTheDocument()
    );
  });
});
