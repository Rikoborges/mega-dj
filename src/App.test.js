import { render, screen } from '@testing-library/react';
import App from './App';

test('mostra o nome do app na tela inicial', () => {
  render(<App />);
  expect(screen.getAllByText(/MEGA DJ PRO/i).length).toBeGreaterThan(0);
});
