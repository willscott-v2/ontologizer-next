import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from './page';

describe('Hello World Challenge', () => {
  it('shows success message when user types "hello world"', async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/type here/i);
    await userEvent.type(input, 'hello world');
    expect(screen.getByText(/success! you typed 'hello world'\./i)).toBeInTheDocument();
  });

  it('does not show success message for incorrect input', async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/type here/i);
    await userEvent.type(input, 'something else');
    expect(screen.queryByText(/success! you typed 'hello world'\./i)).not.toBeInTheDocument();
  });
}); 