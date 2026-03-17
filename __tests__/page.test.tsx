import { render, screen, fireEvent } from '@testing-library/react';
import Home from '../app/page';

describe('Home', () => {
  it('renders the search bar', () => {
    render(<Home />);
    expect(screen.getByPlaceholderText('Find your county or municipality')).toBeInTheDocument();
  });

  it('shows autocomplete options on focus', () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    expect(screen.getByText('Fairfax County')).toBeInTheDocument();
    expect(screen.getByText('Arlington County')).toBeInTheDocument();
    expect(screen.getByText('Loudoun County')).toBeInTheDocument();
  });

  it('filters autocomplete options by query', () => {
    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText('Find your county or municipality'), {
      target: { value: 'arling' },
    });
    expect(screen.getByText('Arlington County')).toBeInTheDocument();
    expect(screen.queryByText('Fairfax County')).not.toBeInTheDocument();
  });

  it('shows score panel after selecting a jurisdiction', () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    fireEvent.mouseDown(screen.getByText('Fairfax County'));
    expect(screen.getByText('Fairfax County, VA')).toBeInTheDocument();
    expect(screen.getByText('Density Constraint Index')).toBeInTheDocument();
  });

  it('shows disclaimer in score panel', () => {
    render(<Home />);
    fireEvent.focus(screen.getByPlaceholderText('Find your county or municipality'));
    fireEvent.mouseDown(screen.getByText('Arlington County'));
    expect(
      screen.getByText(/does not recommend policy positions/i)
    ).toBeInTheDocument();
  });
});
